import { DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const AgencyRevenuePage = () => (
  <div className="p-4 sm:p-6 md:p-8 space-y-6">
    <div>
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Revenue</h1>
      <p className="text-muted-foreground mt-1">Commission tracking and payout management</p>
    </div>
    <Card className="border-border">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <DollarSign className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-foreground">No revenue data yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Commission data will appear once Stripe billing is connected.</p>
      </CardContent>
    </Card>
  </div>
);

export default AgencyRevenuePage;
