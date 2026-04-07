export const LoadingState = ({ title, message }: { title: string; message: string }) => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      <p className="text-muted-foreground mt-1">{message}</p>
    </div>
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  </div>
);
