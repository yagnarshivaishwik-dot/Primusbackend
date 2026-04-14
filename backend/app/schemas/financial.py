from pydantic import BaseModel, ConfigDict


class SubscriptionOut(BaseModel):
    subscription_id: str
    cafe_id: int
    plan: str
    status: str
    amount: str
    currency: str
    billing_cycle: str
    period_start: str
    period_end: str
    trial_ends_at: str | None = None
    created_at: str


class InvoiceOut(BaseModel):
    id: str
    subscription_id: str | None = None
    cafe_id: int
    amount: str
    currency: str
    status: str
    due_date: str
    paid_at: str | None = None
    payment_method: str | None = None
    payment_reference: str | None = None
    line_items: dict | None = None
    created_at: str


class PlatformAuditOut(BaseModel):
    id: str
    cafe_id: int
    txn_type: str
    amount: str
    txn_ref: str | None = None
    user_id: int | None = None
    description: str | None = None
    created_at: str


class ReportDailyOut(BaseModel):
    id: int
    report_date: str
    total_revenue: str
    total_sessions: int
    total_wallet_topups: str
    total_wallet_deductions: str
    total_orders: int
    total_order_revenue: str
    total_upi_payments: str
    model_config = ConfigDict(from_attributes=True)
