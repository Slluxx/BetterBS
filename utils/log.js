// Console helpers that are no-ops in production builds so the shipped
// extension stays free of debug noise.
const enabled = import.meta.env?.DEV ?? false

export const log = enabled ? console.log.bind(console) : () => {}
export const warn = enabled ? console.warn.bind(console) : () => {}
export const error = enabled ? console.error.bind(console) : () => {}

export default { log, warn, error }
