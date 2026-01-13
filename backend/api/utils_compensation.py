from decimal import Decimal, ROUND_HALF_UP

WORK_DAYS_PER_MONTH = Decimal("26")
DEFAULT_MONTHLY_SALARY = Decimal("15000")

ROLE_MONTHLY_SALARY = {
    "manager": Decimal("30000"),
    "assistant manager": Decimal("24000"),
    "head chef": Decimal("26000"),
    "sous chef": Decimal("22000"),
    "line cook": Decimal("18000"),
    "prep cook": Decimal("16000"),
    "pastry chef": Decimal("20000"),
    "dishwasher": Decimal("14000"),
    "barista": Decimal("16000"),
    "cashier": Decimal("16000"),
    "server": Decimal("15000"),
    "host": Decimal("15000"),
    "food runner": Decimal("14000"),
    "catering coordinator": Decimal("23000"),
    "inventory clerk": Decimal("17000"),
}


def normalize_role(value: str) -> str:
    return str(value or "").strip().lower()


def resolve_monthly_salary(role: str) -> Decimal:
    key = normalize_role(role)
    if not key:
        return Decimal("0")
    return ROLE_MONTHLY_SALARY.get(key, DEFAULT_MONTHLY_SALARY)


def calculate_daily_rate(monthly_salary) -> Decimal:
    try:
        monthly = Decimal(str(monthly_salary))
    except Exception:
        return Decimal("0")
    if monthly <= 0:
        return Decimal("0")
    return (monthly / WORK_DAYS_PER_MONTH).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def resolve_compensation(role: str):
    monthly_salary = resolve_monthly_salary(role)
    daily_rate = calculate_daily_rate(monthly_salary)
    return monthly_salary, daily_rate
