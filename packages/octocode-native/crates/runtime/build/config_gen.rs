//! Config codegen: Rust structs, defaults, environment policy, and resolver
//! metadata rendered from `config-contract.json` into `config_contract.rs`.

use super::{
    bool_value, config_path, integer, invalid, object, rust_enum_variant, rust_ident, string,
    to_pascal, to_screaming_snake,
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

fn field_type<'a>(field: &Field<'a>) -> Result<&'a str, Box<dyn Error>> {
    string(
        field
            .definition
            .get("type")
            .ok_or_else(|| invalid(format!("{}.type is required", field.path)))?,
        &format!("{}.type", field.path),
    )
}

/// A field whose contract default is `null`: unset is a distinct value.
fn nullable(field: &Field<'_>) -> bool {
    field.definition.get("default").is_some_and(Value::is_null)
}

fn own_default(field: &Field<'_>) -> Result<Value, Box<dyn Error>> {
    match field_type(field)? {
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

/// The Rust enum an enum field resolves to: its contract `typeName`, else
/// its path in PascalCase (`lsp.prewarm` → `LspPrewarm`).
fn enum_type_name(field: &Field<'_>) -> Result<String, Box<dyn Error>> {
    match field.definition.get("typeName") {
        Some(name) => Ok(string(name, &format!("{}.typeName", field.path))?.to_owned()),
        None => Ok(to_pascal(&field.path)),
    }
}

fn enum_values<'a>(field: &Field<'a>) -> Result<Vec<&'a str>, Box<dyn Error>> {
    field
        .definition
        .get("values")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid(format!("{}.values must be an array", field.path)))?
        .iter()
        .map(|value| string(value, &format!("{}.values", field.path)))
        .collect()
}

/// The Rust expression of a field's contract default.
fn default_literal(field: &Field<'_>) -> Result<String, Box<dyn Error>> {
    let default = own_default(field)?;
    if default.is_null() {
        return Ok("None".to_owned());
    }
    Ok(match field_type(field)? {
        "boolean" => default
            .as_bool()
            .ok_or_else(|| invalid(format!("{}.default must be a boolean", field.path)))?
            .to_string(),
        "enum" => format!(
            "{}::{}",
            enum_type_name(field)?,
            rust_enum_variant(
                default
                    .as_str()
                    .ok_or_else(|| invalid(format!("{} enum default", field.path)))?
            )?
        ),
        "stringArray" => {
            let items = default
                .as_array()
                .ok_or_else(|| invalid(format!("{}.default must be an array", field.path)))?
                .iter()
                .map(|item| {
                    string(item, &format!("{}.default", field.path))
                        .map(|item| format!("{item:?}.to_owned()"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            if items.is_empty() {
                "Vec::new()".to_owned()
            } else {
                format!("vec![{}]", items.join(", "))
            }
        }
        _ => format!(
            "{:?}.to_owned()",
            string(&default, &format!("{}.default", field.path))?
        ),
    })
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

fn rust_field_type(field: &Field<'_>) -> Result<String, Box<dyn Error>> {
    let nullable = nullable(field);
    let base = match field_type(field)? {
        "boolean" => "bool".to_owned(),
        "stringArray" => "Vec<String>".to_owned(),
        "string" | "url" | "path" => "String".to_owned(),
        "enum" => enum_type_name(field)?,
        other => {
            return Err(invalid(format!(
                "unsupported generated Rust field type {other}"
            )));
        }
    };
    Ok(if nullable {
        format!("Option<{base}>")
    } else {
        base
    })
}

/// One Rust enum per enum field. Its default is the contract default (the
/// first value); `as_str` is the wire value.
fn render_enums(output: &mut String, all_fields: &[Field<'_>]) -> Result<(), Box<dyn Error>> {
    let mut rendered = BTreeSet::new();
    for field in all_fields
        .iter()
        .filter(|field| field.resolved && field_type(field).ok() == Some("enum"))
    {
        let name = enum_type_name(field)?;
        if !rendered.insert(name.clone()) {
            return Err(invalid(format!("enum type {name} is declared twice")));
        }
        let values = enum_values(field)?;
        writeln!(
            output,
            "/// `{}` values.\n#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq, serde::Serialize, serde::Deserialize)]\npub enum {name} {{",
            field.path
        )?;
        for (index, value) in values.iter().enumerate() {
            if index == 0 {
                writeln!(output, "    #[default]")?;
            }
            writeln!(
                output,
                "    #[serde(rename = {value:?})]\n    {},",
                rust_enum_variant(value)?
            )?;
        }
        writeln!(
            output,
            "}}\n\nimpl {name} {{\n    /// The contract spelling of this value.\n    #[must_use]\n    pub const fn as_str(self) -> &'static str {{\n        match self {{"
        )?;
        for value in &values {
            writeln!(
                output,
                "            Self::{} => {value:?},",
                rust_enum_variant(value)?
            )?;
        }
        writeln!(
            output,
            "        }}\n    }}\n}}\n\nimpl std::fmt::Display for {name} {{\n    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {{\n        f.write_str(self.as_str())\n    }}\n}}\n"
        )?;
    }
    Ok(())
}

/// One member of a generated struct: name, Rust type, default expression.
type Member = (String, String, String);

fn write_struct(output: &mut String, name: &str, members: &[Member]) -> std::fmt::Result {
    writeln!(
        output,
        "#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]\n#[serde(rename_all = \"camelCase\")]\npub struct {name} {{"
    )?;
    for (member, field_type, _) in members {
        writeln!(output, "    pub {member}: {field_type},")?;
    }
    writeln!(
        output,
        "}}\n\n/// The config contract's defaults.\nimpl Default for {name} {{\n    fn default() -> Self {{\n        Self {{"
    )?;
    for (member, _, default) in members {
        writeln!(output, "            {member}: {default},")?;
    }
    writeln!(output, "        }}\n    }}\n}}\n")
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
    if !sections.contains_key("") {
        return Err(invalid("root section is required"));
    }
    let mut rendered = BTreeMap::<String, Vec<Member>>::new();
    for (section_path, section_value) in sections {
        let section = object(section_value, &format!("sections.{section_path}"))?;
        if !bool_value(section.get("resolved"), false, "section.resolved")? {
            continue;
        }
        let type_name = if section_path.is_empty() {
            "ResolvedConfig".to_owned()
        } else {
            rust_type_name(section_path, section)?
        };
        let mut members = all_fields
            .iter()
            .filter(|field| field.section == section_path && field.resolved)
            .map(|field| {
                Ok((
                    rust_ident(field.key),
                    rust_field_type(field)?,
                    default_literal(field)?,
                ))
            })
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
                let child_type = rust_type_name(&child_path, child)?;
                members.push((
                    rust_ident(key),
                    child_type.clone(),
                    format!("{child_type}::default()"),
                ));
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
        write_struct(output, &type_name, &members)?;
        rendered.insert(type_name, members);
    }

    // One typed setter per resolved field: a value that does not fit its
    // field is an error for that field alone, never for the others.
    writeln!(
        output,
        "impl ResolvedConfig {{\n    /// Set the field at contract `path` from its JSON value; the field\n    /// keeps its value when `value` does not fit its type.\n    pub fn set_json(&mut self, path: &str, value: serde_json::Value) -> Result<(), String> {{\n        let error = |error: serde_json::Error| format!(\"{{path}}: {{error}}\");\n        match path {{"
    )?;
    for field in all_fields.iter().filter(|field| field.resolved) {
        let member = field
            .path
            .split('.')
            .map(rust_ident)
            .collect::<Vec<_>>()
            .join(".");
        writeln!(
            output,
            "            {:?} => self.{member} = serde_json::from_value(value).map_err(error)?,",
            field.path
        )?;
    }
    writeln!(
        output,
        "            _ => return Err(format!(\"{{path}} is not a resolved setting\")),\n        }}\n        Ok(())\n    }}\n}}\n"
    )?;
    Ok(())
}

fn render_field_metadata(
    output: &mut String,
    all_fields: &[Field<'_>],
) -> Result<(), Box<dyn Error>> {
    for (index, field) in all_fields.iter().enumerate() {
        let binding = field
            .definition
            .get("env")
            .map(|value| object(value, &format!("{}.env", field.path)))
            .transpose()?;
        let rendered = match binding {
            None => "None".to_owned(),
            Some(binding) => {
                let name = string(
                    binding
                        .get("name")
                        .ok_or_else(|| invalid(format!("{}.env.name is required", field.path)))?,
                    &format!("{}.env.name", field.path),
                )?;
                let normalize = match binding.get("normalize").and_then(Value::as_str) {
                    Some("trim") => "Some(ConfigNormalize::Trim)",
                    Some("lower") => "Some(ConfigNormalize::Lower)",
                    Some(other) => {
                        return Err(invalid(format!("unsupported normalize mode {other}")));
                    }
                    None => "None",
                };
                format!("Some(ConfigEnvBinding {{ name: {name:?}, normalize: {normalize} }})")
            }
        };
        writeln!(
            output,
            "const FIELD_{index}_ENV: Option<ConfigEnvBinding> = {rendered};\n"
        )?;

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
            "boolean" => "Boolean",
            "stringArray" => "StringArray",
            "enum" => "Enum",
            "url" => "Url",
            "path" => "Path",
            "string" => "String",
            other => return Err(invalid(format!("unsupported field type {other}"))),
        };
        let default_json = serde_json::to_string(&own_default(field)?)?;
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
            "    ConfigFieldSpec {{ path: {:?}, section: {:?}, key: {:?}, kind: ConfigFieldKind::{kind_name}, file: {}, resolved: {}, credential: {credential}, env: FIELD_{index}_ENV, default_json: {:?}, values: FIELD_{index}_VALUES, enum_style: {enum_style}, item_path: {} }},",
            field.path,
            field.section,
            field.key,
            field.file,
            field.resolved,
            default_json,
            field.definition.get("itemFormat").and_then(Value::as_str) == Some("path")
        )?;
    }
    writeln!(output, "];\n")?;
    // One constant per field, named after its path: code names the setting
    // it reads instead of searching CONFIG_FIELDS by a path string.
    writeln!(
        output,
        "/// Every config field by its path (`classification.api` → `CLASSIFICATION_API`).\npub mod field {{\n    use super::{{CONFIG_FIELDS, ConfigFieldSpec}};"
    )?;
    for (index, field) in all_fields.iter().enumerate() {
        writeln!(
            output,
            "    /// `{}`\n    pub const {}: &ConfigFieldSpec = &CONFIG_FIELDS[{index}];",
            field.path,
            to_screaming_snake(&field.path)
        )?;
    }
    writeln!(output, "}}\n")?;
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
        let binding = object(bindings, &format!("{}.env", field.path))?;
        let name = string(
            binding
                .get("name")
                .ok_or_else(|| invalid(format!("{}.env.name is required", field.path)))?,
            &format!("{}.env.name", field.path),
        )?
        .to_owned();
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
        sources.push(name);
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

/// Settings and variables the contract removed, each with the reason a
/// diagnostic names: a removed name is reported, never silently accepted.
fn render_removed(output: &mut String, root: &Map<String, Value>) -> Result<(), Box<dyn Error>> {
    let removed = root
        .get("removed")
        .map(|value| object(value, "contract.removed"))
        .transpose()?;
    for (key, constant) in [
        ("settings", "REMOVED_SETTINGS"),
        ("environment", "REMOVED_ENV_KEYS"),
    ] {
        writeln!(output, "pub const {constant}: &[(&str, &str)] = &[")?;
        if let Some(entries) = removed
            .and_then(|removed| removed.get(key))
            .map(|value| object(value, &format!("contract.removed.{key}")))
            .transpose()?
        {
            for (name, reason) in entries {
                let reason = string(reason, &format!("contract.removed.{key}.{name}"))?;
                writeln!(output, "    ({name:?}, {reason:?}),")?;
            }
        }
        writeln!(output, "];\n")?;
    }
    Ok(())
}

fn render(contract: &Value) -> Result<String, Box<dyn Error>> {
    let root = object(contract, "contract")?;
    let config = object(
        root.get("config")
            .ok_or_else(|| invalid("contract.config is required"))?,
        "contract.config",
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
    let (tokens, protected, home, sources, narrow) = environment_arrays(contract, &all_fields)?;

    let mut output = String::from(
        "// @generated by crates/runtime/build.rs from packages/octocode-config/config-contract.json.\n// Do not edit.\n\n",
    );
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

    // The variables the contract declares outside any setting, by name, so
    // code reading one fails to build when the contract drops it.
    writeln!(
        output,
        "/// Environment variables the contract declares outside any setting.\npub mod environment {{"
    )?;
    for name in object(
        root.get("environment")
            .ok_or_else(|| invalid("contract.environment is required"))?,
        "contract.environment",
    )?
    .keys()
    {
        writeln!(output, "    pub const {name}: &str = {name:?};")?;
    }
    writeln!(output, "}}\n")?;
    write_string_slice(&mut output, "ENV_TOKEN_VARS", &tokens)?;
    write_string_slice(&mut output, "PROTECTED_KEYS", &protected)?;
    write_string_slice(&mut output, "HOME_TRUSTED_ENV_KEYS", &home)?;
    write_string_slice(&mut output, "CONFIG_SOURCE_ENV_KEYS", &sources)?;
    let declared: Vec<String> = object(
        root.get("environment")
            .ok_or_else(|| invalid("contract.environment is required"))?,
        "contract.environment",
    )?
    .keys()
    .cloned()
    .chain(sources.iter().cloned())
    .collect::<BTreeSet<_>>()
    .into_iter()
    .collect();
    writeln!(
        output,
        "/// Every environment variable the config contract declares or binds."
    )?;
    write_string_slice(&mut output, "DECLARED_ENV_KEYS", &declared)?;
    writeln!(
        output,
        "/// Home-trusted switches a workspace may set only to this narrowing value.\npub const WORKSPACE_NARROW_ONLY: &[(&str, &str)] = &["
    )?;
    for (name, value) in &narrow {
        writeln!(output, "    ({name:?}, {value:?}),")?;
    }
    writeln!(output, "];\n")?;
    render_removed(&mut output, root)?;
    render_field_metadata(&mut output, &all_fields)?;
    render_enums(&mut output, &all_fields)?;
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
