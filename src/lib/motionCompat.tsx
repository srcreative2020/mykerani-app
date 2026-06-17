import React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  initial?: any;
  animate?: any;
  exit?: any;
  transition?: any;
  whileHover?: any;
  whileTap?: any;
  whileInView?: any;
  layout?: any;
  layoutId?: any;
  variants?: any;
};

const Div = React.forwardRef<HTMLDivElement, DivProps>(
  ({ initial, animate, exit, transition, whileHover, whileTap, whileInView, layout, layoutId, variants, ...props }, ref) =>
    <div ref={ref} {...props} />
);
Div.displayName = "motion.div";

type SpanProps = React.HTMLAttributes<HTMLSpanElement> & {
  initial?: any; animate?: any; exit?: any; transition?: any;
  whileHover?: any; whileTap?: any;
};
const Span = ({ initial, animate, exit, transition, whileHover, whileTap, ...props }: SpanProps) =>
  <span {...props} />;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  initial?: any; animate?: any; exit?: any; transition?: any;
  whileHover?: any; whileTap?: any;
};
const Button = ({ initial, animate, exit, transition, whileHover, whileTap, ...props }: ButtonProps) =>
  <button {...props} />;

type SectionProps = React.HTMLAttributes<HTMLElement> & {
  initial?: any; animate?: any; exit?: any; transition?: any;
};
const Section = ({ initial, animate, exit, transition, ...props }: SectionProps) =>
  <section {...props} />;

export const motion = { div: Div, span: Span, button: Button, section: Section };

export const AnimatePresence: React.FC<{
  children?: React.ReactNode;
  mode?: string;
  initial?: boolean;
}> = ({ children }) => <>{children}</>;
