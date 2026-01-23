import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import { Button } from '@/components/ui/button';
import verificationService from '@/api/services/verificationService';

const StillPendingPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const verifyToken = sessionStorage.getItem('verify_token') || '';
    if (!verifyToken) return;
    let active = true;

    const checkStatus = async () => {
      try {
        const res = await verificationService.getStatus(verifyToken);
        if (!active) return;
        if (res?.status === 'rejected') {
          navigate('/verify/rejected', { replace: true });
        }
      } catch {}
    };

    checkStatus();
    return () => {
      active = false;
    };
  }, [navigate]);

  const formContent = (
    <AuthCard
      title="Approval Pending"
      compact
      className="!max-w-full sm:!max-w-md lg:!max-w-lg"
      cardClassName="shadow-2xl lg:p-8"
    >
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        Your account is still pending for approval. Please check back soon.
      </p>
      <Button asChild className="w-full">
        <Link to="/login">Go back to Login</Link>
      </Button>
    </AuthCard>
  );

  const introContent = (
    <AuthBrandIntro
      title="Approval in progress"
      description="Thanks for your patience. Our team is reviewing your account."
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

export default StillPendingPage;
