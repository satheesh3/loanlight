/**
 * Converts a Sequelize model instance to a plain object via .toJSON().
 * Falls back to returning the value as-is for plain objects (test mocks).
 */
export function modelToPlain<T extends object>(model: T): object {
  return typeof (model as { toJSON?: unknown }).toJSON === 'function'
    ? (model as { toJSON(): object }).toJSON()
    : model;
}
