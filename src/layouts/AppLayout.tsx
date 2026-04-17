import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ensureSettings } from "@/db/database";

const AppLayout = () => {
  const navigate = useNavigate();

  useEffect(() => {
    ensureSettings();
    const unlocked = sessionStorage.getItem("badr_unlocked");
    if (!unlocked) navigate("/lock", { replace: true });
  }, [navigate]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-card/60 backdrop-blur px-4 sticky top-0 z-30">
            <SidebarTrigger />
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground hidden md:inline">
              نظام مركز البدر — يعمل بدون إنترنت
            </span>
          </header>
          <main className="flex-1 p-4 md:p-6 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
