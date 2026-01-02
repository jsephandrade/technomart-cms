import json
from decimal import Decimal
from django.test import TestCase, Client
from django.conf import settings
from django.utils import timezone as dj_tz
import jwt

from api.models import AppUser, MenuItem, Order, PaymentTransaction


def auth_headers(user):
    payload = {
        'sub': str(user.id),
        'email': user.email,
        'role': user.role,
        'iat': int(dj_tz.now().timestamp()),
        'exp': int(dj_tz.now().timestamp()) + 3600,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {'HTTP_AUTHORIZATION': f'Bearer {token}'}


class OrderFlowTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = AppUser.objects.create(email='staff@example.com', name='Staff', role='staff', status='active')
        self.m1 = MenuItem.objects.create(name='Item A', price=10, available=True)

    def test_create_order_and_status_transitions(self):
        # Create
        resp = self.client.post('/api/orders', data=json.dumps({
            'items': [{'menuItemId': str(self.m1.id), 'quantity': 2}],
            'type': 'walk-in',
        }), content_type='application/json', **auth_headers(self.user))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()['data']
        oid = data['id']
        self.assertIn(data['status'], ['pending','in_queue'])
        # Move to in_progress (from in_queue)
        self.client.patch(f'/api/orders/{oid}/status', data=json.dumps({'status': 'in_progress'}), content_type='application/json', **auth_headers(self.user))
        # Move to ready
        self.client.patch(f'/api/orders/{oid}/status', data=json.dumps({'status': 'ready'}), content_type='application/json', **auth_headers(self.user))
        # Complete
        resp3 = self.client.patch(f'/api/orders/{oid}/status', data=json.dumps({'status': 'completed'}), content_type='application/json', **auth_headers(self.user))
        self.assertEqual(resp3.status_code, 200)
        self.assertEqual(resp3.json()['data']['status'], 'completed')

    def test_idempotent_payment(self):
        # Create order
        resp = self.client.post('/api/orders', data=json.dumps({
            'items': [{'menuItemId': str(self.m1.id), 'quantity': 1}],
        }), content_type='application/json', **auth_headers(self.user))
        oid = resp.json()['data']['id']
        # Pay twice with same idempotency key
        key = 'test-key-123'
        p1 = self.client.post(f'/api/orders/{oid}/payment', data=json.dumps({'amount': 10, 'method': 'cash'}), content_type='application/json', **{**auth_headers(self.user), 'HTTP_IDEMPOTENCY_KEY': key})
        p2 = self.client.post(f'/api/orders/{oid}/payment', data=json.dumps({'amount': 10, 'method': 'cash'}), content_type='application/json', **{**auth_headers(self.user), 'HTTP_IDEMPOTENCY_KEY': key})
        self.assertEqual(p1.status_code, 200)
        self.assertEqual(p2.status_code, 200)
        self.assertEqual(p1.json()['data']['id'], p2.json()['data']['id'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.credit_points, Decimal('0.00'))
        self.client.patch(
            f'/api/orders/{oid}/status',
            data=json.dumps({'status': 'in_prep'}),
            content_type='application/json',
            **auth_headers(self.user),
        )
        self.client.patch(
            f'/api/orders/{oid}/status',
            data=json.dumps({'status': 'staged'}),
            content_type='application/json',
            **auth_headers(self.user),
        )
        resp = self.client.patch(
            f'/api/orders/{oid}/status',
            data=json.dumps({'status': 'completed'}),
            content_type='application/json',
            **auth_headers(self.user),
        )
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.credit_points, Decimal('0.10'))

