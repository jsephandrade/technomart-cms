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
  'inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wider text-primary backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-sm';

const accentTitleClasses =
  'text-base font-bold uppercase tracking-wider bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent leading-tight md:text-lg';

const FeaturePanelCard = ({
  children,
  className,
  badgeText,
  badgeIcon: BadgeIcon,
  badgeClassName,
  title,
  titleStyle = 'default',
  titleIcon: TitleIcon,
  titleIconClassName,
  titleClassName,
  titleAccentClassName,
  description,
  headerActions,
  headerContent,
  headerClassName,
  contentClassName,
  disableDecor = false,
  decorClassName,
  variant = 'default', // 'default', 'gradient', 'minimal', 'elevated'
}) => {
  const renderDecor = (classes) => (
    <div
      className={cn('pointer-events-none absolute', classes, decorClassName)}
    />
  );

  const getVariantClasses = () => {
    switch (variant) {
      case 'gradient':
        return 'bg-gradient-to-br from-card via-card to-muted/30 border-2 border-primary/10 shadow-lg shadow-primary/5';
      case 'minimal':
        return 'border-0 shadow-none bg-transparent';
      case 'elevated':
        return 'shadow-xl shadow-black/10 border-2 border-border/50 bg-card hover:shadow-2xl transition-shadow duration-300';
      default:
        return 'border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200';
    }
  };

  const getDecorVariant = () => {
    switch (variant) {
      case 'gradient':
        return (
          <>
            {renderDecor(
              '-right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-primary/30 via-primary/20 to-transparent blur-3xl animate-pulse'
            )}
            {renderDecor(
              '-bottom-20 left-8 h-56 w-56 rounded-full bg-gradient-to-tr from-accent/20 via-muted/30 to-transparent blur-3xl'
            )}
            {renderDecor(
              'top-1/2 right-1/4 h-32 w-32 rounded-full bg-primary/10 blur-2xl'
            )}
          </>
        );
      case 'elevated':
        return (
          <>
            {renderDecor(
              '-right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-2xl'
            )}
            {renderDecor(
              '-bottom-12 left-8 h-44 w-44 rounded-full bg-muted/30 blur-2xl'
            )}
          </>
        );
      default:
        return (
          <>
            {renderDecor(
              '-right-16 -top-10 h-44 w-44 rounded-full bg-primary/20 blur-3xl'
            )}
            {renderDecor(
              '-bottom-16 left-12 h-48 w-48 rounded-full bg-muted/40 blur-3xl'
            )}
          </>
        );
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-xl',
        getVariantClasses(),
        className
      )}
    >
      {!disableDecor && variant !== 'minimal' && getDecorVariant()}

      <CardHeader className={cn('relative pb-3', headerClassName)}>
        <div className="flex w-full flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2.5 md:flex-1 md:min-w-0">
            {(title || badgeText) && (
              <div className="flex flex-wrap items-center gap-3">
                {title &&
                  (titleStyle === 'accent' ? (
                    <div
                      className={cn(
                        accentContainerClasses,
                        'text-base md:text-lg',
                        titleAccentClassName
                      )}
                    >
                      {TitleIcon && (
                        <TitleIcon
                          className={cn(
                            'h-4 w-4 text-primary/90 drop-shadow-sm',
                            titleIconClassName
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <CardTitle
                        className={cn(accentTitleClasses, titleClassName)}
                      >
                        {title}
                      </CardTitle>
                    </div>
                  ) : (
                    <CardTitle
                      className={cn(
                        'text-2xl font-bold tracking-tight md:text-3xl',
                        titleClassName
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {TitleIcon && (
                          <TitleIcon
                            className={cn(
                              'h-6 w-6 text-primary drop-shadow-sm',
                              titleIconClassName
                            )}
                            aria-hidden="true"
                          />
                        )}
                        <span>{title}</span>
                      </span>
                    </CardTitle>
                  ))}
                {badgeText && (
                  <div className={cn(accentContainerClasses, badgeClassName)}>
                    {BadgeIcon && (
                      <BadgeIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                      {badgeText}
                    </span>
                  </div>
                )}
              </div>
            )}
            {description && (
              <CardDescription className="text-sm md:text-base leading-relaxed">
                {description}
              </CardDescription>
            )}
          </div>
          {(headerActions || headerContent) && (
            <div className="flex w-full flex-col gap-2.5 md:w-auto md:flex-shrink-0 md:items-end">
              {headerActions && (
                <div className="flex w-full flex-wrap gap-2 justify-start md:w-auto md:justify-end">
                  {headerActions}
                </div>
              )}
              {headerContent && (
                <div className="w-full md:w-auto">{headerContent}</div>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className={cn('relative space-y-4 pt-2', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
};

export default FeaturePanelCard;
