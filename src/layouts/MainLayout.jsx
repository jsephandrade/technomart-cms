import React, { useState } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bell, LogOut, Settings, HelpCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Logout dialog imports
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const LAYOUT_SCROLLBAR_STYLES = `
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
`;

const MainLayout = ({ children }) => {
  const isMobile = useIsMobile();
  const { logout, user } = useAuth();
  const location = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Real-time notification count from API
  const { unreadCount } = useNotifications();

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user?.email) return 'U';
    const email = user.email;
    return email.charAt(0).toUpperCase();
  };

  // Get page title from route
  const getPageTitle = () => {
    const path = location.pathname;
    const titles = {
      '/': 'Dashboard',
      '/pos': 'Point of Sale',
      '/menu': 'Menu Management',
      '/orders': 'Orders',
      '/inventory': 'Inventory',
      '/catering': 'Catering',
      '/employees': 'Employees',
      '/schedule': 'Schedule',
      '/analytics': 'Analytics',
      '/customers': 'Customers',
      '/notifications': 'Notifications',
      '/settings': 'Settings',
      '/help': 'Help & Support',
    };
    return titles[path] || 'Dashboard';
  };

  return (
    <>
      <style>{LAYOUT_SCROLLBAR_STYLES}</style>
      <SidebarProvider defaultOpen={!isMobile}>
        <div className="flex min-h-screen w-full bg-background lg:h-screen lg:min-h-0">
          {/* Sidebar */}
          <Sidebar variant="sidebar" collapsible="icon">
            <NavigationSidebar />
          </Sidebar>

          {/* Main content */}
          <SidebarInset className="flex flex-col flex-1 min-h-screen w-full bg-background lg:min-h-0 lg:bg-transparent">
            {/* Modern Header */}
            <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b bg-background/90 px-4 py-2 sm:gap-3 sm:px-6 sm:py-3 lg:flex-nowrap lg:items-center lg:gap-0 lg:bg-background/95 lg:px-6 lg:py-0 lg:h-16 lg:min-h-0 backdrop-blur supports-[backdrop-filter]:bg-background/60 min-h-[64px]">
              {/* Left Section */}
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 lg:flex-none lg:min-w-fit lg:gap-4">
                <SidebarTrigger className="h-11 w-11 rounded-full border border-border/40 bg-background shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:h-9 lg:w-9 lg:rounded-md lg:border-none lg:bg-transparent lg:shadow-none" />
                <Separator
                  orientation="vertical"
                  className="hidden h-7 sm:block sm:h-8 lg:h-6"
                />
                <h1 className="truncate text-[clamp(1.1rem,0.9vw+0.9rem,1.75rem)] font-semibold leading-tight tracking-tight text-foreground lg:text-lg">
                  {getPageTitle()}
                </h1>
              </div>

              {/* Right Section */}
              <div className="flex flex-none items-center gap-2 sm:gap-3 lg:gap-2 pl-4 sm:pl-0">
                {/* Quick Actions */}
                <div className="flex items-center gap-2 sm:gap-3 lg:gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-11 w-11 min-h-[44px] min-w-[44px] rounded-full border border-transparent bg-background/70 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:h-9 lg:w-9 lg:min-h-0 lg:min-w-0 lg:rounded-md lg:border-none lg:bg-transparent"
                    asChild
                  >
                    <Link to="/help">
                      <HelpCircle className="size-[clamp(1.1rem,1.2vw,1.4rem)] lg:size-4" />
                      <span className="sr-only">Help</span>
                    </Link>
                  </Button>

                  {/* Notifications with Badge */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-11 w-11 min-h-[44px] min-w-[44px] rounded-full border border-transparent bg-background/70 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:h-9 lg:w-9 lg:min-h-0 lg:min-w-0 lg:rounded-md lg:border-none lg:bg-transparent"
                    asChild
                  >
                    <Link to="/notifications">
                      <Bell className="size-[clamp(1.1rem,1.2vw,1.4rem)] lg:size-4" />
                      {unreadCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-[10px] sm:text-xs animate-in zoom-in-50 duration-200"
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                      )}
                      <span className="sr-only">
                        Notifications{' '}
                        {unreadCount > 0 ? `(${unreadCount} unread)` : ''}
                      </span>
                    </Link>
                  </Button>
                </div>

                <Separator
                  orientation="vertical"
                  className="h-7 mx-2 sm:h-8 lg:h-6"
                />

                {/* User Menu Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="min-h-[44px] gap-2 rounded-full border border-transparent px-3 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-4 lg:h-9 lg:rounded-md lg:border-none lg:px-2"
                    >
                      <Avatar className="h-10 w-10 sm:h-11 sm:w-11 lg:h-7 lg:w-7">
                        <AvatarImage src={user?.avatarUrl} alt={user?.email} />
                        <AvatarFallback className="text-sm font-semibold lg:text-xs">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden text-[clamp(0.85rem,0.9vw,1rem)] font-medium md:inline-block lg:text-sm">
                        {user?.email?.split('@')[0] || 'User'}
                      </span>
                      <ChevronDown className="size-[clamp(1rem,0.9vw,1.25rem)] opacity-60 lg:h-4 lg:w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user?.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user?.email || 'user@example.com'}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/settings" className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/help" className="cursor-pointer">
                        <HelpCircle className="mr-2 h-4 w-4" />
                        <span>Help & Support</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer text-destructive focus:text-destructive"
                      onClick={() => setShowLogoutDialog(true)}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            {/* Page Content */}
            <main className="hide-scrollbar flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-4 sm:p-5 md:p-6 lg:p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to logout?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed out of your account and may need to log in again
              to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={logout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MainLayout;
