export const oderNull = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
