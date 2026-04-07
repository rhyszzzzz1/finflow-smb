export const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="py-10 text-center text-muted-foreground">
    <p className="font-medium text-foreground">{title}</p>
    <p className="mt-1 text-sm">{description}</p>
  </div>
);
