// Captures the pristine page URL before vue-router's hash history initializes.
//
// createWebHashHistory() re-bases the current URL via pushState/replaceState
// as soon as the router is constructed, which can rewrite the page path (on
// sites with a `<base href="//host/">` tag it lands at the origin root). That
// would hide the /serie/... path we auto-detect from. This module must be
// imported FIRST in content.ts so `location.href` is read before the router
// is built. The window write is an observable side effect that pins the module
// evaluation order in the bundled output.
const originalUrl = location.href
window.__bsOriginalUrl = originalUrl

export default originalUrl
