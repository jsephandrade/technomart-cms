import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const accentContainerClasses =
  'inline-flex max-w-fit items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1 text-[clamp(0.6rem,1vw,0.75rem)] font-semibold uppercase tracking-wide text-primary shadow-sm sm:px-3 sm:py-1.5 sm:text-xs';
const accentTitleClasses =
  'text-[clamp(0.7rem,1.2vw,0.85rem)] font-bold uppercase tracking-wider bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent sm:text-sm';
const headingClasses =
  'text-[clamp(1rem,2vw,1.35rem)] font-semibold tracking-tight sm:text-2xl';
const baseCardClasses =
  'relative w-full max-w-[420px] sm:max-w-full mx-auto overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow duration-200 hover:shadow-md';

export const UserManagementCardDecor = () => (
  <div
    className="pointer-events-none absolute -right-16 -top-10 h-44 w-44 rounded-full bg-primary/20 blur-3xl"
    aria-hidden="true"
  />
);

const UserManagementCard = ({
  children,
  className,
  title,
  titleStyle = 'default',
  titleIcon: TitleIcon,
  titleIconClassName,
  titleClassName,
  titleAccentClassName,
  description,
  decor,
  headerActions,
  headerContent,
  headerClassName,
  contentClassName,
}) => {
  return (
    <Card className={cn(baseCardClasses, className)}>
      {decor}
      <CardHeader
        className={cn(
          'flex flex-col gap-3 rounded-t-2xl px-3 py-4 sm:px-6 sm:py-5',
          headerClassName
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            {title &&
              (titleStyle === 'accent' ? (
                <div
                  className={cn(accentContainerClasses, titleAccentClassName)}
                >
                  {TitleIcon && (
                    <TitleIcon
                      className={cn(
                        'h-4 w-4 text-primary drop-shadow-sm',
                        titleIconClassName
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(accentTitleClasses, titleClassName)}
                    aria-label={title}
                  >
                    {title}
                  </span>
                </div>
              ) : (
                <CardTitle className={cn(headingClasses, titleClassName)}>
                  <span className="flex items-center gap-2">
                    {TitleIcon && (
                      <TitleIcon
                        className={cn(
                          'h-5 w-5 text-primary drop-shadow-sm',
                          titleIconClassName
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span>{title}</span>
                  </span>
                </CardTitle>
              ))}

            {description && (
              <CardDescription className="max-w-prose text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {description}
              </CardDescription>
            )}
          </div>

          {(headerActions || headerContent) && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {headerActions && (
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {headerActions}
                </div>
              )}
              {headerContent && (
                <div className="flex w-full min-w-[120px] justify-start sm:w-auto sm:justify-end">
                  {headerContent}
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          'space-y-3 px-3 pb-4 sm:space-y-4 sm:px-6',
          contentClassName
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
};

export default UserManagementCard;
