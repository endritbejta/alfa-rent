/**
 * Sidebar collapse is remembered in a cookie, not localStorage.
 *
 * localStorage cannot be read while the server renders, so the server would
 * always emit the expanded sidebar and the client would snap it shut on
 * hydration — a visible flinch on every single page load. A cookie arrives
 * with the request, so the first paint is already correct.
 *
 * The value is written client-side with document.cookie rather than through a
 * server action: collapsing a sidebar should not cost a round trip, and the
 * server only ever reads it on the next navigation.
 */
export const SIDEBAR_COOKIE = "alfa_sidebar";
export const SIDEBAR_COLLAPSED = "collapsed";

/** A year. Getting your sidebar back the way you left it is not a session. */
export const SIDEBAR_MAX_AGE = 60 * 60 * 24 * 365;
