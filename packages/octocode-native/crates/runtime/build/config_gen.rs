//! Config codegen: Rust structs, defaults, environment policy, and resolver
//! metadata rendered from `config-contract.json` into `config_contract.rs`.

use super::{
    bool_value, config_path, integer, invalid, object, rust_enum_variant, rust_ident, set_path,
    string, to_pascal,
};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::error::Error;
use std::fmt::Write as _;
use std::fs;
use std::path::PathBuf;

struct Field<'a> {
    path: String,
    section: &'a str,
    key: &'a str,
    definition: &'a Map<String, Value>,
    file: bool,
    resolved: bool,
}

type EnvironmentArrays = (
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<(String, String)>,
);

fn fields<'a>(contract: &'a Value) -> Result<Vec<Field<'a>>, Box<dyn Error>> {
    let sections = object(
        object(contract, "contract")?
            .get("sections")
            .ok_or_else(|| invalid("contract.sections is required"))?,
        "contract.sections",
    )?;
    let mut output = Vec::new();
    for (section_path, section_value) in sections {
        let section = object(section_value, &format!("sections.{section_path}"))?;
        let file = bool_value(section.get("file"), false, "section.file")?;
        let section_resolved = bool_value(section.get("resolved"), false, "section.resolved")?;
        let definitions = object(
            section
                .get("fields")
                .ok_or_else(|| invalid(format!("sections.{section_path}.fields is required")))?,
            &format!("sections.{section_path}.fields"),
        )?;
        for (key, definition_value) in definitions {
            let definition = object(
                definition_value,
                &format!("sections.{section_path}.fields.{key}"),
            )?;
            let credential = bool_value(definition.get("credential"), false, "field.credential")?;
            output.push(Field {
                path: if section_path.is_empty() {
                    key.clone()
                } else {
                    format!("{section_path}.{key}")
                },
                section: section_path,
                key,
                definition,
                file,
                resolved: section_resolved && !credential,
            });
        }
    }
    Ok(output)
}

fn own_default(field: &Field<'_>, schema_version: i64) -> Result<Value, Box<dyn Error>> {
    let field_type = string(
        field
            .definition
            .get("type")
            .ok_or_else(|| invalid(format!("{}.type is required", field.path)))?,
        &format!("{}.type", field.path),
    )?;
    match field_type {
        "schemaVersion" => Ok(Value::from(schema_version)),
        "number" => {
            let minimum = integer(
                field
                    .definition
                    .get("minimum")
                    .ok_or_else(|| invalid(format!("{}.minimum is required", field.path)))?,
                &format!("{}.minimum", field.path),
            )?;
            let span = integer(
                field
                    .definition
                    .get("span")
                    .ok_or_else(|| invalid(format!("{}.span is required", field.path)))?,
                &format!("{}.span", field.path),
            )?;
            let offset = integer(
                field
                    .definition
                    .get("defaultOffset")
                    .ok_or_else(|| invalid(format!("{}.defaultOffset is required", field.path)))?,
                &format!("{}.defaultOffset", field.path),
            )?;
            Ok(Value::from(minimum + offset.min(span)))
        }
        "enum" => field
            .definition
            .get("values")
            .and_then(Value::as_array)
            .and_then(|values| values.first())
            .cloned()
            .ok_or_else(|| invalid(format!("{}.values must not be empty", field.path))),
        _ => field
            .definition
            .get("default")
            .cloned()
            .ok_or_else(|| invalid(format!("{}.default is required", field.path))),
    }
}

fn build_defaults(all_fields: &[Field<'_>], schema_version: i64) -> Result<Value, Box<dyn Error>> {
    let mut defaults = Value::Object(Map::new());
    for field in all_fields.iter().filter(|field| field.resolved) {
        set_path(
            &mut defaults,
            &field.path,
            own_default(field, schema_version)?,
        )?;
    }
    Ok(defaults)
}

fn write_string_slice(
    output: &mut String,
    name: &str,
    values: &[String],
) -> Result<(), std::fmt::Error> {
    writeln!(output, "pub const {name}: &[&str] = &[")?;
    for value in values {
        writeln!(output, "    {value:?},")?;
    }
    writeln!(output, "];\n")
}

fn direct_children(section_path: &str, sections: &Map<String, Value>) -> Vec<String> {
    let prefix = if section_path.is_empty() {
        String::new()
    } else {
        format!("{section_path}.")
    };
    sections
        .keys()
        .filter(|candidate| {
            !candidate.is_empty()
                && *candidate != section_path
                && candidate.starts_with(&prefix)
                && !candidate[prefix.len()..].contains('.')
        })
        .cloned()
        .collect()
}

fn rust_type_name(
    section_path: &str,
    section: &Map<String, Value>,
) -> Result<String, Box<dyn Error>> {
    let base = if let Some(name) = section.get("rustTypeName") {
        string(name, &format!("sections.{section_path}.rustTypeName"))?.to_owned()
    } else if let Some(name) = section.get("typeName") {
        string(name, &format!("sections.{section_path}.typeName"))?.to_owned()
    } else {
        to_pascal(section_path)
    };
    Ok(format!("{base}Config"))
}

fn rust_field_type(definition: &Map<String, Value>) -> Result<String, Box<dyn Error>> {
    let kind = string(
        definition
            .get("type")
            .ok_or_else(|| invalid("field.type is required"))?,
        "field.type",
    )?;
    let nullable = definition.get("default").is_some_and(Value::is_null);
    Ok(match kind {
        "schemaVersion" => "serde_json::Value".to_owned(),
        "boolean" => "bool".to_owned(),
        "number" => "f64".to_owned(),
        "stringArray" if nullable => "Option<Vec<String>>".to_owned(),
        "stringArray" => "Vec<String>".to_owned(),
        "string" | "url" | "path" if nullable => "Option<String>".to_owned(),
        "string" | "url" | "path" | "enum" => "String".to_owned(),
        other => {
            return Err(invalid(format!(
                "unsupported generated Rust field type {other}"
            )));
        }
    })
}

fn render_structs(
    output: &mut String,
    contract: &Value,
    all_fields: &[Field<'_>],
) -> Result<(), Box<dyn Error>> {
    let sections = object(
        object(contract, "contract")?
            .get("sections")
            .ok_or_else(|| invalid("contract.sections is required"))?,
        "contract.sections",
    )?;
    let mut rendered = BTreeMap::<String, Vec<(String, String)>>::new();
    for (section_path, section_value) in sections {
        if section_path.is_empty() {
            continue;
        }
        let section = object(section_value, &format!("sections.{section_path}"))?;
        if !bool_value(section.get("resolved"), false, "section.resolved")? {
            continue;
        }
        let type_name = rust_type_name(section_path, section)?;
        let mut members = all_fields
            .iter()
            .filter(|field| field.section == section_path && field.resolved)
            .map(|field| Ok((rust_ident(field.key), rust_field_type(field.definition)?)))
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
        for child_path in direct_children(section_path, sections) {
            let child = object(
                sections
                    .get(&child_path)
                    .ok_or_else(|| invalid(format!("missing section {child_path}")))?,
                &format!("sections.{child_path}"),
            )?;
            if bool_value(child.get("resolved"), false, "section.resolved")? {
                let key = child_path
                    .rsplit('.')
                    .next()
                    .ok_or_else(|| invalid(format!("invalid child section {child_path}")))?;
                members.push((rust_ident(key), rust_type_name(&child_path, child)?));
            }
        }
        if let Some(existing) = rendered.get(&type_name) {
            if existing != &members {
                return Err(invalid(format!(
                    "Rust type {type_name} is reused by incompatible sections"
                )));
            }
            continue;
        }
        rendered.insert(type_name.clone(), members.clone());
        writeln!(
            output,
            "#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]\n#[serde(rename_all = \"camelCase\")]\npub struct {type_name} {{"
        )?;
        for (name, field_type) in members {
            writeln!(output, "    pub {name}: {field_type},")?;
        }
        writeln!(output, "}}\n")?;
    }

    if !sections.contains_key("") {
        return Err(invalid("root section is required"));
    }
    writeln!(
        output,
        "#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]\n#[serde(rename_all = \"camelCase\")]\npub struct ResolvedConfig {{"
    )?;
    for field in all_fields
        .iter()
        .filter(|field| field.section.is_empty() && field.resolved)
    {
        writeln!(
            output,
            "    pub {}: {},",
            rust_ident(field.key),
            rust_field_type(field.definition)?
        )?;
    }
    for child_path in direct_children("", sections) {
        let child = object(
            sections
                .get(&child_path)
                .ok_or_else(|| invalid(format!("missing section {child_path}")))?,
            &format!("sections.{child_path}"),
        )?;
        if bool_value(child.get("resolved"), false, "section.resolved")? {
            writeln!(
                output,
                "    pub {}: {},",
                rust_ident(&child_path),
                rust_type_name(&child_path, child)?
            )?;
        }
    }
    writeln!(output, "}}\n")?;
    Ok(())
}

fn render_field_metadata(
    output: &mut String,
    all_fields: &[Field<'_>],
    schema_version: i64,
) -> Result<(), Box<dyn Error>> {
    for (index, field) in all_fields.iter().enumerate() {
        let env = field.definition.get("env").map_or(Ok(None), |value| {
            Ok::<_, Box<dyn Error>>(Some(object(value, &format!("{}.env", field.path))?))
        })?;
        let mut bindings = env
            .map(|bindings| {
                bindings
                    .iter()
                    .map(|(name, value)| {
                        let binding = object(value, &format!("{}.env.{name}", field.path))?;
                        Ok((
                            name,
                            integer(
                                binding
                                    .get("priority")
                                    .ok_or_else(|| invalid("env priority is required"))?,
                                "env priority",
                            )?,
                            binding,
                        ))
                    })
                    .collect::<Result<Vec<_>, Box<dyn Error>>>()
            })
            .transpose()?
            .unwrap_or_default();
        bindings.sort_by_key(|(_, priority, _)| *priority);
        writeln!(output, "const FIELD_{index}_ENV: &[ConfigEnvBinding] = &[")?;
        for (name, _, binding) in bindings {
            let normalize = match binding.get("normalize").and_then(Value::as_str) {
                Some("trim") => "Some(ConfigNormalize::Trim)",
                Some("lower") => "Some(ConfigNormalize::Lower)",
                Some(other) => return Err(invalid(format!("unsupported normalize mode {other}"))),
                None => "None",
            };
            let invalid_mode = match binding.get("invalid").and_then(Value::as_str) {
                Some("default") => "ConfigInvalidEnv::Default",
                Some("skip") | None => "ConfigInvalidEnv::Skip",
                Some(other) => return Err(invalid(format!("unsupported invalid mode {other}"))),
            };
            writeln!(
                output,
                "    ConfigEnvBinding {{ name: {name:?}, normalize: {normalize}, invalid: {invalid_mode} }},"
            )?;
        }
        writeln!(output, "];\n")?;

        let values = field
            .definition
            .get("values")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .map(|value| {
                        string(value, &format!("{}.values", field.path)).map(ToOwned::to_owned)
                    })
                    .collect::<Result<Vec<_>, Box<dyn Error>>>()
            })
            .transpose()?
            .unwrap_or_default();
        write_string_slice(output, &format!("FIELD_{index}_VALUES"), &values)?;
    }

    writeln!(output, "pub const CONFIG_FIELDS: &[ConfigFieldSpec] = &[")?;
    for (index, field) in all_fields.iter().enumerate() {
        let kind_name = match string(
            field
                .definition
                .get("type")
                .ok_or_else(|| invalid(format!("{}.type is required", field.path)))?,
            &format!("{}.type", field.path),
        )? {
            "schemaVersion" => "SchemaVersion",
            "boolean" => "Boolean",
            "number" => "Number",
            "stringArray" => "StringArray",
            "enum" => "Enum",
            "url" => "Url",
            "path" => "Path",
            "string" => "String",
            other => return Err(invalid(format!("unsupported field type {other}"))),
        };
        let default_json = serde_json::to_string(&own_default(field, schema_version)?)?;
        let minimum = field
            .definition
            .get("minimum")
            .map(|value| integer(value, &format!("{}.minimum", field.path)))
            .transpose()?;
        let maximum = match (minimum, field.definition.get("span")) {
            (Some(minimum), Some(span)) => {
                Some(minimum + integer(span, &format!("{}.span", field.path))?)
            }
            _ => None,
        };
        let enum_style = match field.definition.get("enumStyle").and_then(Value::as_str) {
            Some("quotedOr") => "ConfigEnumStyle::QuotedOr",
            Some("list") | None => "ConfigEnumStyle::List",
            Some(other) => return Err(invalid(format!("unsupported enum style {other}"))),
        };
        let credential = bool_value(
            field.definition.get("credential"),
            false,
            "field.credential",
        )?;
        writeln!(
            output,
            "    ConfigFieldSpec {{ path: {:?}, section: {:?}, key: {:?}, kind: ConfigFieldKind::{kind_name}, file: {}, resolved: {}, credential: {credential}, env: FIELD_{index}_ENV, default_json: {:?}, minimum: {:?}, maximum: {:?}, values: FIELD_{index}_VALUES, enum_style: {enum_style}, item_path: {} }},",
            field.path,
            field.section,
            field.key,
            field.file,
            field.resolved,
            default_json,
            minimum.map(|value| value as f64),
            maximum.map(|value| value as f64),
            field.definition.get("itemFormat").and_then(Value::as_str) == Some("path")
        )?;
    }
    writeln!(output, "];\n")?;
    Ok(())
}

fn environment_arrays(
    contract: &Value,
    all_fields: &[Field<'_>],
) -> Result<EnvironmentArrays, Box<dyn Error>> {
    let root = object(contract, "contract")?;
    let environment = object(
        root.get("environment")
            .ok_or_else(|| invalid("contract.environment is required"))?,
        "contract.environment",
    )?;
    let mut protected = Vec::new();
    let mut home = Vec::new();
    let mut sources = Vec::new();
    let mut tokens = Vec::new();
    let mut narrow = Vec::new();
    for (name, definition_value) in environment {
        let definition = object(definition_value, &format!("environment.{name}"))?;
        match definition
            .get("dotenv")
            .and_then(Value::as_str)
            .unwrap_or("all")
        {
            "never" => protected.push(name.clone()),
            "home" => {
                protected.push(name.clone());
                home.push(name.clone());
            }
            "all" => {}
            other => return Err(invalid(format!("unsupported dotenv policy {other}"))),
        }
        if definition.get("configSource").and_then(Value::as_bool) == Some(true) {
            sources.push(name.clone());
        }
        if let Some(priority) = definition.get("tokenPriority") {
            tokens.push((
                integer(priority, &format!("environment.{name}.tokenPriority"))?,
                name.clone(),
            ));
        }
    }
    for field in all_fields {
        let Some(bindings) = field.definition.get("env") else {
            continue;
        };
        for (name, binding_value) in object(bindings, &format!("{}.env", field.path))? {
            let binding = object(binding_value, &format!("{}.env.{name}", field.path))?;
            match binding
                .get("dotenv")
                .and_then(Value::as_str)
                .unwrap_or("all")
            {
                "never" => protected.push(name.clone()),
                "home" => {
                    protected.push(name.clone());
                    home.push(name.clone());
                }
                "all" => {}
                other => return Err(invalid(format!("unsupported dotenv policy {other}"))),
            }
            if let Some(value) = binding.get("workspaceNarrowsTo") {
                narrow.push((
                    name.clone(),
                    string(
                        value,
                        &format!("{}.env.{name}.workspaceNarrowsTo", field.path),
                    )?
                    .to_owned(),
                ));
            }
            sources.push(name.clone());
        }
    }
    tokens.sort_by_key(|(priority, _)| *priority);
    let unique = |values: Vec<String>| {
        values
            .into_iter()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    };
    Ok((
        tokens.into_iter().map(|(_, name)| name).collect(),
        unique(protected),
        unique(home),
        unique(sources),
        narrow,
    ))
}

fn render(contract: &Value) -> Result<String, Box<dyn Error>> {
    let root = object(contract, "contract")?;
    let config = object(
        root.get("config")
            .ok_or_else(|| invalid("contract.config is required"))?,
        "contract.config",
    )?;
    let schema_version = integer(
        config
            .get("schemaVersion")
            .ok_or_else(|| invalid("config.schemaVersion is required"))?,
        "config.schemaVersion",
    )?;
    let file_name = string(
        config
            .get("fileName")
            .ok_or_else(|| invalid("config.fileName is required"))?,
        "config.fileName",
    )?;
    let surfaces = config
        .get("runtimeSurfaces")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("config.runtimeSurfaces must be an array"))?
        .iter()
        .map(|value| string(value, "runtime surface").map(ToOwned::to_owned))
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    let default_surface = surfaces
        .first()
        .ok_or_else(|| invalid("config.runtimeSurfaces must not be empty"))?;
    let all_fields = fields(contract)?;
    let defaults = build_defaults(&all_fields, schema_version)?;
    let (tokens, protected, home, sources, narrow) = environment_arrays(contract, &all_fields)?;

    let mut output = String::from(
        "// @generated by crates/runtime/build.rs from packages/octocode-config/config-contract.json.\n// Do not edit.\n\n",
    );
    writeln!(
        output,
        "pub const CONFIG_SCHEMA_VERSION: i64 = {schema_version};"
    )?;
    writeln!(
        output,
        "pub const CONFIG_FILE_NAME: &str = {file_name:?};\n"
    )?;
    writeln!(
        output,
        "#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, serde::Serialize, serde::Deserialize)]\n#[serde(rename_all = \"lowercase\")]\npub enum RuntimeSurface {{"
    )?;
    for surface in &surfaces {
        if surface == default_surface {
            writeln!(output, "    #[default]")?;
        }
        writeln!(output, "    {},", rust_enum_variant(surface)?)?;
    }
    writeln!(output, "}}\n")?;

    write_string_slice(&mut output, "ENV_TOKEN_VARS", &tokens)?;
    write_string_slice(&mut output, "PROTECTED_KEYS", &protected)?;
    write_string_slice(&mut output, "HOME_TRUSTED_ENV_KEYS", &home)?;
    write_string_slice(&mut output, "CONFIG_SOURCE_ENV_KEYS", &sources)?;
    writeln!(
        output,
        "/// Home-trusted switches a workspace may set only to this narrowing value.\npub const WORKSPACE_NARROW_ONLY: &[(&str, &str)] = &["
    )?;
    for (name, value) in &narrow {
        writeln!(output, "    ({name:?}, {value:?}),")?;
    }
    writeln!(output, "];\n")?;
    render_field_metadata(&mut output, &all_fields, schema_version)?;
    writeln!(
        output,
        "pub const DEFAULT_RESOLVED_CONFIG_JSON: &str = {:?};\n",
        serde_json::to_string(&defaults)?
    )?;
    render_structs(&mut output, contract, &all_fields)?;
    Ok(output)
}

pub(super) fn generate_config_contract() -> Result<(), Box<dyn Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let contract_path = config_path(&manifest_dir, "config-contract.json");
    println!("cargo:rerun-if-changed={}", contract_path.display());

    // The contract is authored and JSON-Schema-validated (Ajv2020) by the
    // octocode-config generator and committed pre-validated. `render()` below
    // independently fails closed on any missing or mistyped field, so
    // re-validating the meta-schema here only ever bought a heavyweight
    // `jsonschema` build-dependency (fancy-regex, fraction, num-bigint, idna, …)
    // compiled on every clean build of every platform. Schema authority stays
    // with the generator; structural safety stays with `render()`.
    let contract: Value = serde_json::from_str(&fs::read_to_string(&contract_path)?)?;

    let output_path = PathBuf::from(env::var("OUT_DIR")?).join("config_contract.rs");
    fs::write(output_path, render(&contract)?)?;
    Ok(())
}
