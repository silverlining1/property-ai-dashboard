import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Logo } from "./Logo";

export const PASSWORD_HINT = "At least 12 characters, with upper and lower case letters and a number.";

/** The centered card used by every signed-out page. */
export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3">
          <Logo />
          <h1 className="text-xl font-semibold leading-none tracking-tight">{title}</h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export function FormError({ error, id }: { error: string | null; id?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");
