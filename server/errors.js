export function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function notFound(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}
