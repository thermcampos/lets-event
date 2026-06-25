import { Calendar, LogOut, Menu } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/event-types", label: "Event Types" },
    { href: "/dashboard/bookings", label: "Bookings" },
    { href: "/dashboard/availability", label: "Availability" },
    { href: "/dashboard/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="border-b bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                <span className="ml-2 text-xl font-bold">Event.me</span>
              </div>
              <nav className="hidden md:flex gap-4">
                {navItems.map((item) => (
                  <Button key={item.href} variant="ghost" asChild>
                    <a href={item.href}>{item.label}</a>
                  </Button>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <ThemeToggle />
              <div className="hidden sm:block text-sm">
                <p className="font-medium">{session.user.name}</p>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  {session.user.email}
                </p>
              </div>
              <form action={handleSignOut} className="hidden sm:block">
                <Button variant="ghost" size="icon" type="submit">
                  <LogOut className="h-5 w-5" />
                </Button>
              </form>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] sm:w-[350px]">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-6 mt-6">
                    <div className="border-b pb-4">
                      <p className="font-medium">{session.user.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {session.user.email}
                      </p>
                    </div>
                    <nav className="flex flex-col gap-2">
                      {navItems.map((item) => (
                        <SheetClose asChild key={item.href}>
                          <Button variant="ghost" asChild className="justify-start">
                            <a href={item.href}>{item.label}</a>
                          </Button>
                        </SheetClose>
                      ))}
                    </nav>
                    <div className="border-t pt-4 mt-auto">
                      <form action={handleSignOut}>
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          type="submit"
                        >
                          <LogOut className="h-5 w-5 mr-2" />
                          Sign Out
                        </Button>
                      </form>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
