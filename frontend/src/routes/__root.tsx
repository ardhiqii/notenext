import App from '@/App'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

const RootLayout = () => (
  <>
    <App/>
    <TanStackRouterDevtools />
  </>
)

export const Route = createRootRoute({ component: RootLayout })