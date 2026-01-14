from django.urls import path
from . import views

urlpatterns = [
    path('create_order/', views.create_order, name='create-order'),
    path('orders/', views.list_orders, name='list-orders'),
    path('offers/', views.list_special_offers, name='offers'),

    path('user-credit-points/', views.user_credit_points, name='user-credit-points'),
    path('redeem-offer/', views.redeem_offer, name='redeem_offer'),
    path('api/offers/', views.list_special_offers, name='offers'),
    path('orders/<str:order_number>/cancel/', views.cancel_order, name='cancel-order'),

    path('orders/<str:order_number>/', views.get_order, name='get-order'),
    path('orders/<str:order_number>/status/', views.order_status, name='order-status'),
    path('orders/<str:order_number>/gcash_qr/', views.fetch_gcash_qr, name='fetch-gcash-qr'),
    path('orders/<str:order_number>/gcash_link/', views.gcash_link, name='gcash-link'),
    path('orders/<str:order_number>/confirm_payment/', views.confirm_payment, name='confirm-payment'),
    path('orders/<str:order_number>/payment-proof/', views.submit_payment_proof, name='payment-proof-submit'),
    path('payments/proofs/', views.list_payment_proofs, name='payment-proof-list'),
    path('payments/proofs/<uuid:proof_id>/verify/', views.verify_payment_proof, name='payment-proof-verify'),
    path('payments/proofs/<uuid:proof_id>/reject/', views.reject_payment_proof, name='payment-proof-reject'),
]
