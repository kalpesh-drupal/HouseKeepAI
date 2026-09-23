import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  href?: string;
  variant?: "default" | "danger" | "warning" | "success" | "info";
}

const variants = {
  default: "border-border bg-card",
  danger: "border-red-200 bg-red-50",
  warning: "border-yellow-200 bg-yellow-50",
  success: "border-green-200 bg-green-50",
  info: "border-blue-200 bg-blue-50",
};

export function StatCard({ title, value, subtitle, icon: Icon, href, variant = "default" }: StatCardProps) {
  const content = (
    <div className={cn("rounded-2xl border p-6 shadow-sm transition hover:shadow-md", variants[variant])}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="rounded-xl bg-white/80 p-3 shadow-sm">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}
