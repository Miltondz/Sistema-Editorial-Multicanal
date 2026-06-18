import { convexAuthNextjsMiddleware, createRouteMatcher } from '@convex-dev/auth/nextjs/server'

const isPublicRoute = createRouteMatcher(['/login'])

export default convexAuthNextjsMiddleware((request, { convexAuth }) => {
  if (!isPublicRoute(request) && !convexAuth.isAuthenticated()) {
    return Response.redirect(new URL('/login', request.url))
  }
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
