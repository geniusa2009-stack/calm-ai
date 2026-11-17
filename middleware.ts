import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.cookies.get("calm_session")?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/((?!login|api|_next/|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
