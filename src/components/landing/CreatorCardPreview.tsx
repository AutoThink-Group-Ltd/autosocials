interface CreatorCardPreviewProps {
  name: string;
  handle: string;
  followers: string;
  niche: string;
}

const CreatorCardPreview = ({ name, handle, followers, niche }: CreatorCardPreviewProps) => {
  return (
    <div className="bg-secondary/50 rounded-xl p-4 border border-border/50 hover:shadow-card transition-all duration-300 group cursor-pointer">
      <div className="aspect-square rounded-lg bg-gradient-to-br from-primary/10 to-accent/30 mb-3 flex items-center justify-center overflow-hidden">
        <div className="w-12 h-12 rounded-full gradient-brand flex items-center justify-center">
          <span className="text-primary-foreground font-semibold text-lg">{name[0]}</span>
        </div>
      </div>
      <h4 className="font-semibold text-sm text-foreground truncate">{name}</h4>
      <p className="text-xs text-muted-foreground mb-2">{handle}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{followers}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{niche}</span>
      </div>
    </div>
  );
};

export default CreatorCardPreview;
