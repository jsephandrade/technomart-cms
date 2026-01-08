import { Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import { Button } from '@/components/ui/button';

const VerifyIdentityPendingPage = () => {
  const formContent = (
    <AuthCard
      title="Verification Pending"
      compact
      className="!max-w-full sm:!max-w-md lg:!max-w-lg"
      cardClassName="shadow-2xl lg:p-8"
    >
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        Your account has been sent for verification. Please wait for approval
        within 2-3 business days.
      </p>
      <Button asChild className="w-full">
        <Link to="/login">Go to Login</Link>
      </Button>
    </AuthCard>
  );

  const introContent = (
    <AuthBrandIntro
      title="Thanks for your patience"
      description="Our team is reviewing your details. We will notify you as soon as your account is approved."
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

export default VerifyIdentityPendingPage;
