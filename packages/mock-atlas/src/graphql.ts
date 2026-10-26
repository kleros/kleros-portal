export type Location = { line: number; column: number };
type Token = { text: string; location: Location };
type Value =
  | { kind: "variable"; name: string; location?: Location; definition?: Location }
  | { kind: "literal"; value: unknown; enum: boolean; location?: Location }
  | { kind: "object"; fields: Record<string, Value>; location?: Location }
  | { kind: "list"; items: Value[]; location?: Location };
export type Field = {
  name: string;
  key: string;
  args: Record<string, Value>;
  fields: Field[];
  location?: Location;
};
export type GraphqlBody = { operationName?: string; query?: string; variables?: Record<string, unknown> };
export class GraphqlError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public location?: Location,
  ) {
    super(message);
  }
}

const tokenize = (query: string): Token[] => {
  const tokens: Token[] = [];
  const pattern =
    /\s+|#[^\r\n]*|,|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z_0-9]*|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\S/g;
  for (const match of query.matchAll(pattern)) {
    const text = match[0];
    if (/^(?:\s|#|,)/.test(text)) continue;
    const prefix = query.slice(0, match.index);
    tokens.push({
      text,
      location: { line: prefix.split("\n").length, column: prefix.length - prefix.lastIndexOf("\n") },
    });
  }
  return tokens;
};

class Parser {
  private index = 0;
  private variableLocations = new Map<string, Location>();
  constructor(private tokens: Token[]) {}
  peek() {
    return this.tokens[this.index]?.text;
  }
  take(): Token {
    const token = this.tokens[this.index++];
    if (!token) throw new GraphqlError("Syntax Error: Unexpected <EOF>.", "GRAPHQL_PARSE_FAILED");
    return token;
  }
  expect(text: string) {
    const token = this.take();
    if (token.text !== text)
      throw new GraphqlError(
        `Syntax Error: Expected "${text}", found "${token.text}".`,
        "GRAPHQL_PARSE_FAILED",
        undefined,
        token.location,
      );
  }
  value(): Value {
    const { text, location } = this.take();
    if (text === "$") {
      const name = this.take().text;
      return { kind: "variable", name, location, definition: this.variableLocations.get(name) };
    }
    if (text === "{") {
      const fields: Record<string, Value> = {};
      while (this.peek() !== "}") {
        const name = this.take().text;
        this.expect(":");
        fields[name] = this.value();
      }
      this.expect("}");
      return { kind: "object", fields, location };
    }
    if (text === "[") {
      const items: Value[] = [];
      while (this.peek() !== "]") items.push(this.value());
      this.expect("]");
      return { kind: "list", items, location };
    }
    if (text.startsWith('"'))
      return {
        kind: "literal",
        value: text.startsWith('"""') ? text.slice(3, -3) : JSON.parse(text),
        enum: false,
        location,
      };
    if (/^(?:true$|false$|null$|-?\d)/.test(text))
      return { kind: "literal", value: JSON.parse(text), enum: false, location };
    return { kind: "literal", value: text, enum: true, location };
  }
  args(): Record<string, Value> {
    const args: Record<string, Value> = {};
    if (this.peek() !== "(") return args;
    this.take();
    while (this.peek() !== ")") {
      const name = this.take().text;
      this.expect(":");
      args[name] = this.value();
    }
    this.expect(")");
    return args;
  }
  selection(): Field[] {
    this.expect("{");
    const fields: Field[] = [];
    while (this.peek() !== "}") {
      const token = this.take();
      if (!/^[A-Za-z_]\w*$/.test(token.text))
        throw new GraphqlError("mock-atlas: unsupported selection", "GRAPHQL_PARSE_FAILED", undefined, token.location);
      const key = token.text;
      const name = this.peek() === ":" ? (this.take(), this.take().text) : key;
      const args = this.args();
      if (this.peek() === "@")
        throw new GraphqlError("mock-atlas: directives are not supported", "GRAPHQL_VALIDATION_FAILED");
      fields.push({ name, key, args, fields: this.peek() === "{" ? this.selection() : [], location: token.location });
    }
    this.expect("}");
    return fields;
  }
  operation(variables: Record<string, unknown>) {
    // Braces in variable defaults are values, not the operation's selection set.
    while (this.peek() && this.peek() !== "{") {
      if (this.take().text !== "(") continue;
      while (this.peek() !== ")") {
        const definition = this.tokens[this.index]?.location;
        this.expect("$");
        const name = this.take().text;
        if (definition) this.variableLocations.set(name, definition);
        this.expect(":");
        while (this.peek() && !["=", "$", ")"].includes(this.peek()!)) this.take();
        if (this.peek() === "=") {
          this.take();
          const value = resolveValue(this.value(), variables);
          if (!(name in variables)) variables[name] = value;
        }
      }
      this.expect(")");
    }
    return this.selection()[0];
  }
}

const legacyFields: Record<string, string> = {
  GetNonce: "nonce",
  Login: "login",
  Roles: "roles",
  GetUser: "user",
  AddUser: "addUser",
  UpdateEmail: "updateEmail",
  ConfirmEmail: "confirmEmail",
  DeleteUser: "deleteUser",
  NotificationTopics: "notificationTopics",
  UpdateNotificationSubscriptions: "updateNotificationSubscriptions",
  isSubscribed: "isSubscribed",
};
const legacyArguments: Record<string, string> = { addUserSettings: "settings", confirmEmailInput: "confirmEmailInput" };

export const parseOperation = (body: GraphqlBody) => {
  const variables = { ...body.variables };
  if (body.query?.trim()) {
    const field = new Parser(tokenize(body.query)).operation(variables);
    if (field) return { field, variables };
  }
  const name = legacyFields[body.operationName ?? ""] ?? body.operationName ?? "unknown";
  const args = Object.fromEntries(Object.keys(variables).map((key) => [key, { kind: "variable", name: key } as Value]));
  for (const [arg, variable] of Object.entries(legacyArguments)) {
    if (variable in variables) args[arg] = { kind: "variable", name: variable };
  }
  if (name === "confirmEmail")
    args.confirmEmailInput = {
      kind: "object",
      fields: {
        address: { kind: "variable", name: "address" },
        token: { kind: "variable", name: "token" },
      },
    };
  const fields =
    name === "user"
      ? ["email", "isEmailVerified", "emailUpdateableAt"].map((key) => ({ name: key, key, args: {}, fields: [] }))
      : [];
  return { field: { name, key: name, args, fields } as Field, variables };
};

export const resolveValue = (node: Value | undefined, variables: Record<string, unknown>): unknown => {
  if (!node) return undefined;
  switch (node.kind) {
    case "variable":
      return variables[node.name];
    case "literal":
      return node.value;
    case "list":
      return node.items.map((item) => resolveValue(item, variables));
    case "object":
      return Object.fromEntries(Object.entries(node.fields).map(([key, item]) => [key, resolveValue(item, variables)]));
  }
};

export const inputAt = (
  field: Field,
  arg: string,
  variables: Record<string, unknown>,
  path: (string | number)[] = [],
) => {
  let node = field.args[arg];
  let variable: string | undefined;
  let variablePath = "";
  let variableLocation: Location | undefined;
  let value: unknown;
  for (const part of [...path, undefined]) {
    if (node?.kind === "variable") {
      variable = node.name;
      variableLocation = node.definition ?? node.location;
      variablePath = node.name;
      value = variables[node.name];
      node = undefined;
    }
    if (part === undefined) break;
    if (variable) {
      value = (value as Record<string | number, unknown> | undefined)?.[part];
      variablePath += typeof part === "number" ? `[${part}]` : `.${part}`;
    } else if (node?.kind === "object") node = node.fields[part];
    else if (node?.kind === "list" && typeof part === "number") node = node.items[part];
    else node = undefined;
  }
  return {
    value: variable ? value : resolveValue(node, variables),
    variable,
    variablePath,
    node,
    location: variableLocation ?? node?.location ?? field.args[arg]?.location,
  };
};

export const enumInput = <T extends string>(
  input: ReturnType<typeof inputAt>,
  name: string,
  values: Record<string, T>,
  required = false,
): T | undefined => {
  const { value, variable, variablePath, node, location } = input;
  if (value == null && !required) return undefined;
  if (
    typeof value === "string" &&
    Object.hasOwn(values, value) &&
    (variable || (node?.kind === "literal" && node.enum))
  )
    return values[value];
  const message =
    value == null
      ? `Expected non-nullable type "${name}!" not to be null.`
      : typeof value === "string" && (variable || (node?.kind === "literal" && node.enum))
        ? `Value "${value}" does not exist in "${name}" enum.`
        : `Enum "${name}" cannot represent non-enum value: ${JSON.stringify(value)}.`;
  const prefix = variable
    ? `Variable "$${variable}" got invalid value ${JSON.stringify(value)}${variablePath !== variable ? ` at "${variablePath}"` : ""}; `
    : "";
  throw new GraphqlError(
    prefix + message,
    variable ? "BAD_USER_INPUT" : "GRAPHQL_VALIDATION_FAILED",
    undefined,
    location,
  );
};

export const projectFields = (value: unknown, fields: Field[]): unknown => {
  if (value == null || !fields.length) return value;
  if (Array.isArray(value)) return value.map((entry) => projectFields(entry, fields));
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    fields.map((field) => [field.key, projectFields(record[field.name] ?? null, field.fields)]),
  );
};
