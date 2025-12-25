import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
const HelpPage = () => {
  const { user } = useAuth();
  const supportEmail = 'josephformentera2@gmail.com';
  const defaultBody = useMemo(() => {
    const lines = [];
    lines.push('Hello TechnoMart Support,', '');
    if (user?.email) {
      const name = user?.name ? user.name + ' ' : '';
      lines.push(`From: ${name}<${user.email}>`);
    }
    if (user?.id) lines.push(`User ID: ${user.id}`);
    if (user?.role) lines.push(`Role: ${user.role}`);
    if (typeof window !== 'undefined' && window.location?.href) {
      lines.push(`Page: ${window.location.href}`);
    }
    lines.push('', 'Please describe your issue here...');
    return lines.join('\n');
  }, [user]);
  // Pre-composed mailto (not used directly; kept for future deep link)
  // Compose dialog state
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(supportEmail);
  const [from, setFrom] = useState(user?.email || '');
  const [body, setBody] = useState(defaultBody);
  useEffect(() => {
    setTo(supportEmail);
  }, [supportEmail]);
  useEffect(() => {
    setFrom(user?.email || '');
  }, [user?.email]);
  useEffect(() => {
    setBody(defaultBody);
  }, [defaultBody]);
  const faqs = [
    {
      question: 'How do I manage menu items?',
      answer:
        'Navigate to the Menu Management section from the sidebar. You can add, edit, or remove menu items, set prices, and update availability status.',
    },
    {
      question: 'How do I process orders in the POS system?',
      answer:
        'Go to the Point of Sale section, select items from the menu, add them to the cart, and process payment. You can handle cash or card transactions.',
    },
    {
      question: 'How do I view analytics?',
      answer:
        'The Analytics page provides comprehensive reports on revenue, inventory, orders, staff attendance, and customer purchases. Use the tabs and filters to view specific periods.',
    },
    {
      question: 'How do I schedule employees?',
      answer:
        'In the Employee Schedule section, you can create shifts, assign employees, and manage work schedules. Employees can view their schedules and request changes.',
    },
    {
      question: 'How do I manage inventory?',
      answer:
        "The Inventory section allows you to track stock levels, set reorder points, and manage suppliers. You'll receive alerts when items are running low.",
    },
    {
      question: 'How do I handle customer feedback?',
      answer:
        'Customer feedback is displayed in the Feedback section. You can view, respond to, and mark feedback as resolved to improve customer satisfaction.',
    },
  ];
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Help Center</h1>
        <p className="text-muted-foreground">
          Find answers to common questions and get support for TechnoMart
          Canteen Management System.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>
            Common questions and answers about using the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Need More Help?</CardTitle>
          <CardDescription>
            Contact our support team for additional assistance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => setOpen(true)}
            >
              <Mail className="h-4 w-4" />
              Email Support
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Compose Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="compose-to">To</Label>
              <Input
                id="compose-to"
                type="email"
                value={to}
                readOnly
                placeholder="support@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="compose-from">From</Label>
              <Input
                id="compose-from"
                type="email"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="you@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Your email client will use your configured account as the actual
                sender. We include this value at the top of the message for
                clarity.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="compose-body">Message</Label>
              <Textarea
                id="compose-body"
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const subject = encodeURIComponent(
                  (import.meta.env && import.meta.env.VITE_SUPPORT_SUBJECT) ||
                    'TechnoMart Support Request'
                );
                let finalBody = body || '';
                const fromLine = from ? `From: <${from}>` : '';
                if (fromLine && !finalBody.toLowerCase().includes('from:')) {
                  finalBody = `${fromLine}\n\n${finalBody}`;
                }
                const href = `mailto:${encodeURIComponent(supportEmail)}?subject=${subject}&body=${encodeURIComponent(finalBody)}`;
                try {
                  window.location.href = href;
                } finally {
                  toast('Opening your email client...', {
                    description: `If it didn't open, email ${supportEmail}`,
                  });
                  setOpen(false);
                }
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default HelpPage;
