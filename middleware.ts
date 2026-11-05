import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast path for signed-out visitors: with no session cookie at all, answer a page
 * request with a real 307 to /login (route-level loading UI would otherwise stream a
 * 200 skeleton before the in-page redirect). This is NOT the security boundary — the
 * cookie isn't validated here; every page still calls requireUser() and every API
 * route still goes through route().
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get("calm_session")?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Pages only: not /login, the API (which returns 401 itself), or static assets.
  matcher: ["/((?!login|api|_next/|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
