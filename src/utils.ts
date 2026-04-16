/**
 * Split a qualified path like "Package::Type::member" into type and member parts.
 * For "Person::setAge": type = "Person", member = "setAge"
 * For "pkg::Person::setAge": type = "pkg::Person", member = "setAge"
 * For "Person": type = "Person", member = undefined
 */
export function splitQualifiedPath(path: string): { type: string; member: string | undefined } {
  const lastSep = path.lastIndexOf('::');
  if (lastSep < 0) {
    return { type: path, member: undefined };
  }
  return {
    type: path.substring(0, lastSep),
    member: path.substring(lastSep + 2),
  };
}
