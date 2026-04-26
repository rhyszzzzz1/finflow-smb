import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DateRange } from "./reportTypes";
import { yearRange } from "./reportTypes";

type Props = {
  range: DateRange;
  onChangeRange: (next: DateRange) => void;
  asOfDate: string;
  onChangeAsOfDate: (next: string) => void;
};

export function ReportDateControls({ range, onChangeRange, asOfDate, onChangeAsOfDate }: Props) {
  const nowYear = new Date().getFullYear();
  const presetYears = [nowYear - 1, nowYear, nowYear + 1];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Report dates</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="grid gap-2">
          <Label>Preset year</Label>
          <Select
            value={range.startDate.slice(0, 4)}
            onValueChange={(value) => {
              const yr = Number(value);
              if (!Number.isFinite(yr)) return;
              const next = yearRange(yr);
              onChangeRange(next);
              onChangeAsOfDate(next.endDate);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {presetYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Range start</Label>
          <Input type="date" value={range.startDate} onChange={(e) => onChangeRange({ ...range, startDate: e.target.value })} />
        </div>

        <div className="grid gap-2">
          <Label>Range end</Label>
          <Input type="date" value={range.endDate} onChange={(e) => onChangeRange({ ...range, endDate: e.target.value })} />
        </div>

        <div className="grid gap-2">
          <Label>As of</Label>
          <Input type="date" value={asOfDate} onChange={(e) => onChangeAsOfDate(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

