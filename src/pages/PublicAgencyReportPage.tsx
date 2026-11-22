import { useParams } from "@/lib/router-compat";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, FileText, Calendar, Eye } from "lucide-react";

const PublicAgencyReportPage = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (token) loadReport();
  }, [token]);

  const loadReport = async () => {
    const { data } = await supabase
      .from("agency_reports")
      .select("*")
      .eq("token", token ?? "")
      .eq("is_active", true)
      .single();

    if (data) {
      setReport(data);
      // Track view
      await supabase
        .from("agency_reports")
        .update({
          view_count: (data.view_count || 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">Report not found</h3>
            <p className="text-sm text-muted-foreground mt-2">This report link is invalid or has been deactivated.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="shadow-card border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Calendar className="w-3 h-3" />
              {report.date_from && report.date_to
                ? `${new Date(report.date_from).toLocaleDateString()} — ${new Date(report.date_to).toLocaleDateString()}`
                : "All time"}
              <span className="ml-auto flex items-center gap-1">
                <Eye className="w-3 h-3" /> {report.view_count} views
              </span>
            </div>
            <CardTitle className="text-2xl">{report.title}</CardTitle>
            {report.custom_message && (
              <CardDescription className="mt-2 whitespace-pre-wrap">{report.custom_message}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-16 h-16 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">Campaign performance data will be displayed here once campaigns are active.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicAgencyReportPage;
