import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

function validator() {
  const ajv = new Ajv2020({ strict: false, validateFormats: true });
  addFormats(ajv);
  return ajv;
}

export function createQueryDefaults(tools, ajv = validator()) {
  const schemas = new Map(tools.map(tool => [tool.name, tool.inputSchema]));
  const checks = new WeakMap();
  return (tool, query) => {
    const root = schemas.get(tool);
    if (!root) return {};
    const resolve = schema => {
      const seen = new Set();
      while (schema?.$ref?.startsWith('#/') && !seen.has(schema)) {
        seen.add(schema);
        schema = schema.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
      }
      return schema;
    };
    const accepts = schema => {
      if (!schema || typeof schema !== 'object') return schema === true;
      if (!checks.has(schema)) checks.set(schema, ajv.compile({ $defs: root.$defs, ...schema }));
      return checks.get(schema)(query);
    };
    const fieldDefault = schema => {
      schema = resolve(schema);
      return schema && Object.hasOwn(schema, 'default') ? { value: schema.default } : null;
    };
    const collect = schema => {
      schema = resolve(schema);
      if (!schema || typeof schema !== 'object') return {};
      const defaults = {};
      for (const [field, property] of Object.entries(schema.properties ?? {})) {
        const fact = fieldDefault(property);
        if (fact) defaults[field] = fact.value;
      }
      for (const branch of schema.allOf ?? []) Object.assign(defaults, collect(branch));
      for (const union of [schema.anyOf, schema.oneOf].filter(Boolean)) {
        const matching = union.map(resolve).filter(accepts).map(collect);
        for (const [field, value] of Object.entries(matching[0] ?? {})) {
          if (matching.every(branch => Object.hasOwn(branch, field) && JSON.stringify(branch[field]) === JSON.stringify(value))) defaults[field] = value;
        }
      }
      return defaults;
    };
    return collect(root.properties.queries.items);
  };
}
