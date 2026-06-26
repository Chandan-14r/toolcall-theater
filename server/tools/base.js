export class PermissionDeniedError extends Error {
  constructor(toolName, requiredPermission) {
    super(`PermissionDeniedError: Execution of tool "${toolName}" was rejected because the session context is missing the "${requiredPermission}" permission.`);
    this.name = "PermissionDeniedError";
    this.toolName = toolName;
    this.requiredPermission = requiredPermission;
  }
}

export class SchemaValidationError extends Error {
  constructor(toolName, message) {
    super(`SchemaValidationError: Tool "${toolName}" schema validation failed. Detail: ${message}`);
    this.name = "SchemaValidationError";
  }
}

export class Tool {
  constructor(name, description, inputSchema, requiredPermission, timeoutMs = 5000, sideEffectClass = "read") {
    if (!name || !description || !inputSchema) {
      throw new SchemaValidationError(name || "unknown", "Tool must define name, description, and inputSchema.");
    }
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.requiredPermission = requiredPermission;
    this.timeoutMs = timeoutMs;
    this.sideEffectClass = sideEffectClass; // "read" | "write" | "execute"
  }

  async run(input, context = {}) {
    throw new Error("Method 'run' must be implemented.");
  }
}
