import { Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import { Button } from '@/components/ui/button';

const VerifyIdentityRejectedPage = () => {
  const formContent = (
    <AuthCard
      title="Verification Rejected"
      compact
      className="!max-w-full sm:!max-w-md lg:!max-w-lg"
      cardClassName="shadow-2xl lg:p-8"
    >
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        Your verification request was not approved. If you believe this is a
        mistake, please contact your administrator before trying again.
      </p>
      <Button asChild className="w-full">
        <Link to="/login">Go back to Login</Link>
      </Button>
    </AuthCard>
  );

  const introContent = (
    <AuthBrandIntro
      title="Request not approved"
      description="We were unable to verify your account at this time."
      className="w-full max-w-xl px-3 sm:px-6 lg:px-8"
      contentClassName="space-y-1 sm:space-y-3 text-center sm:text-left"
      titleClassName="text-[20px] sm:text-4xl"
      descriptionClassName="text-[9px] sm:text-sm"
    />
  );

  return (
    <PageTransition>
      <AuthPageShell
        backgroundImage={AUTH_PAGE_DEFAULT_BACKGROUND}
        waveImage="/images/b1bc6b54-fe3f-45eb-8a39-005cc575deef.png"
        formWrapperClassName="max-w-xl mr-auto md:mr-[min(8rem,14vw)] md:ml-0"
        formSlot={formContent}
        asideSlot={introContent}
      />
    </PageTransition>
  );
};

export default VerifyIdentityRejectedPage;
