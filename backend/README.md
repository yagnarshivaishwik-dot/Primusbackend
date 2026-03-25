# Lance Backend API

A comprehensive FastAPI backend for the Lance gaming cafe management system.

## Features

- **User Management**: Registration, authentication, profiles with JWT
- **PC Management**: Client PC tracking, groups, remote control
- **Session Management**: User sessions, time tracking, billing
- **Wallet System**: User wallets, transactions, balance management
- **Game Library**: Game catalog, installations, play tracking
- **Real-time Features**: WebSocket connections for live updates
- **Payment Integration**: Stripe and Razorpay support
- **Social Authentication**: Google, Discord, Twitter OAuth
- **Admin Dashboard**: Comprehensive admin controls
- **Booking System**: PC reservations and scheduling
- **Support System**: Tickets, chat, announcements
- **Membership Tiers**: User groups with discounts
- **Offers & Coupons**: Promotional system
- **Leaderboards**: Gaming statistics and rankings

## Tech Stack

- **Framework**: FastAPI
- **Database**: SQLAlchemy with PostgreSQL (SQLite for development)
- **Authentication**: JWT tokens
- **WebSockets**: For real-time communication
- **Task Queue**: Redis (optional)
- **Email**: SMTP support
- **File Storage**: Local filesystem
- **Deployment**: Gunicorn + Uvicorn workers

## Prerequisites

- Python 3.10+
- Redis (optional, for OTP and caching)
- PostgreSQL (recommended for production)
- SMTP server (for emails)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/lance-backend.git
cd lance-backend
```

2. Create virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment:
```bash
cp env.example .env
# Edit .env with your configuration
```

5. Run the application:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

## Configuration

Key environment variables (see `env.example` for full list):

- `DATABASE_URL`: Database connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `SECRET_KEY`: Application secret key
- `APP_BASE_URL`: Base URL for the application
- `SMTP_*`: Email configuration
- `STRIPE_*`: Stripe payment configuration
- `RAZORPAY_*`: Razorpay payment configuration
- `GOOGLE_CLIENT_*`: Google OAuth credentials
- `REDIS_URL`: Redis connection (optional)

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   └── endpoints/      # API route handlers
│   ├── crud/               # Database operations
│   ├── models.py           # SQLAlchemy models
│   ├── schemas.py          # Pydantic schemas
│   ├── database.py         # Database configuration
│   ├── utils/              # Utility functions
│   └── ws/                 # WebSocket handlers
├── scripts/                # Utility scripts
├── main.py                 # Application entry point
├── requirements.txt        # Python dependencies
├── env.example            # Environment variables template
└── README.md              # This file
```

## Development

### Running Tests
```bash
pytest
```

### Code Formatting
```bash
black .
isort .
```

### Database Migrations

The application automatically creates tables on startup. For production, consider using Alembic for migrations.

### Adding New Endpoints

1. Create endpoint file in `app/api/endpoints/`
2. Define schemas in `app/schemas.py`
3. Add CRUD operations in `app/crud/`
4. Include router in `app/main.py`

## Deployment

See `DEPLOYMENT.md` for detailed deployment instructions. Quick overview:

1. Set up Ubuntu 22.04 server
2. Install dependencies (Python, PostgreSQL, Redis, Nginx)
3. Clone repository
4. Configure environment variables
5. Set up systemd service
6. Configure Nginx reverse proxy
7. Install SSL certificate

## API Endpoints

Major endpoint categories:

- `/api/auth/*` - Authentication and registration
- `/api/user/*` - User management
- `/api/pc/*` - PC management
- `/api/session/*` - Session management
- `/api/game/*` - Game library
- `/api/wallet/*` - Wallet operations
- `/api/payment/*` - Payment processing
- `/api/booking/*` - Booking system
- `/api/admin/*` - Admin operations
- `/ws/*` - WebSocket connections

## Security

- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Rate limiting on sensitive endpoints
- SQL injection protection via SQLAlchemy
- Environment-based secrets

## Monitoring

- Health check endpoint: `/health`
- Structured logging
- Error tracking
- Performance metrics
- Prometheus metrics endpoint (if `prometheus-client` installed): `/metrics`
  - `primus_cache_hits{cache_name="..."}` – count of cache hits
  - `primus_cache_misses{cache_name="..."}` – count of cache misses

### Redis Caching Architecture

- **Client:** Single shared async Redis client (`redis.asyncio`) configured from environment:
  - `REDIS_URL` – Redis connection URL (e.g. `redis://127.0.0.1:6379/0`)
  - `REDIS_PASSWORD` – optional password (required in production)
  - `REDIS_NAMESPACE` – logical namespace prefix (default `primus`)
  - `CACHE_DEFAULT_TTL` – default TTL in seconds for generic entries
  - `REDIS_CONNECTION_MAX` – maximum connections in pool
- **Key format:**  
  `primus:{ENVIRONMENT}:{CACHE_VERSION}:{type}:{id_or_hash}`
  - `ENVIRONMENT` – `development` / `test` / `production`
  - `CACHE_VERSION` – `CACHE_VERSION` env var or default `v1` (use to safely invalidate schemas)
  - `type` – logical cache bucket (`game_catalog`, `stats_summary`, `pc_status_latest`, etc.)
  - `id_or_hash` – concrete identifier or pattern (e.g. `id=1`, `pc=42`, or parameter hash)
- **Behaviour:**
  - All Redis calls are wrapped in `try/except` – failures are treated as cache misses.
  - On startup, the app attempts a `PING` to Redis; if unavailable, caching is disabled but the API continues to serve from the database.
  - Background task subscribes to a Redis Pub/Sub channel to process invalidation messages across workers.

### Cached Endpoints & TTLs

| Area            | Endpoint (prefix)         | Cache Type              | Example Key Id                           | TTL (seconds) |
|-----------------|--------------------------|-------------------------|------------------------------------------|---------------|
| Game catalog    | `/api/games`             | `game_catalog`          | query params (skip/limit/search/...)     | 600           |
| Game count      | `/api/games/count`       | `game_count`            | filters (search/category/enabled)        | 600           |
| Leaderboard     | `/api/leaderboard/{id}`  | `leaderboard_entries`   | `id={leaderboard_id}`                    | 20            |
| Leaderboard list| `/api/leaderboard/`      | `leaderboard_list`      | `all`                                    | 300           |
| Analytics       | `/api/stats/summary`     | `stats_summary`         | period + start/end                       | 900           |
| Analytics       | `/api/stats/top-users`   | `stats_top_users`       | `top-users`                              | 1800          |
| Analytics       | `/api/stats/peak-hours`  | `stats_peak_hours`      | `peak-hours`                             | 1800          |
| Analytics       | `/api/stats/sales-series`| `stats_sales_series`    | period + start/end                       | 1800          |
| Analytics       | `/api/stats/users-series`| `stats_users_series`    | period + start/end                       | 1800          |
| Analytics       | `/api/stats/sales-table` | `stats_sales_table`     | period + start/end                       | 1800          |
| Sessions        | `/api/session/guests`    | `session_active_guests` | `all`                                    | 15            |
| PC status       | `/api/hardware/latest`   | `pc_status_latest`      | `all`                                    | 10            |
| PC status       | `/api/hardware/history`  | `pc_status_history`     | `pc={pc_id}`                             | 30            |
| PC ban          | `/api/pcban/status/{id}` | `pc_ban_status`         | `{pc_id}`                                | 10            |
| Client PCs      | `/api/clientpc/`         | `client_pc_list`        | `role={role}|cafe={cafe_id}`             | 15            |

### Invalidation Mapping (Writes → Cache)

Targeted invalidation is performed by publishing messages to a Redis Pub/Sub channel and deleting matching keys (including cross-worker):

- **Games:**
  - Writes: `POST/PUT/DELETE /api/games/*`
  - Invalidates: `game_catalog:*`, `game_count:*`
- **Leaderboards:**
  - Writes: `POST /api/leaderboard/`, `POST /api/leaderboard/record/{leaderboard_id}`
  - Invalidates: `leaderboard_list:*`, `leaderboard_entries:id={leaderboard_id}`
- **Sessions:**
  - Writes: `POST /api/session/start`, `POST /api/session/stop/{id}`
  - Invalidates: `session_active_guests:*`
- **PC status & hardware:**
  - Writes: `POST /api/hardware/`, `POST /api/clientpc/heartbeat/{pc_id}`, `POST /api/clientpc/register`, `POST /api/clientpc/rebind/{pc_id}`, `POST /api/pcban/ban/{pc_id}`, `POST /api/pcban/unban/{pc_id}`
  - Invalidates: `pc_status_latest:*`, `pc_status_history:pc={pc_id}`, `client_pc_list:*`, `pc_ban_status:{pc_id}`
- **Analytics (wallet/payments/orders):**
  - Writes: `POST /api/wallet/topup`, `POST /api/wallet/deduct`, `POST /api/payment/order`, `POST /api/payment/product`
  - Invalidates: `stats_summary:*`, `stats_top_users:*`, `stats_sales_series:*`, `stats_sales_table:*`

### Local Development & CI

- Local Redis (optional but recommended for testing cache):
  - From `backend/`: `docker-compose -f docker-compose.redis.yml up -d`
  - Env: `REDIS_URL=redis://127.0.0.1:6379/0`
- CI:
  - GitHub Actions workflow `.github/workflows/backend-redis-tests.yml` runs backend tests with a Redis service.

### Production Rollout & Security

- **Network & TLS**
  - Run Redis in a private subnet (no public Internet access).
  - Require `AUTH` with a strong password (set `REDIS_PASSWORD` and configure Redis accordingly).
  - Enable TLS (`rediss://` URL or TLS-enabled endpoint on managed providers).
- **Configuration**
  - Set `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_NAMESPACE`, `CACHE_DEFAULT_TTL`, `REDIS_CONNECTION_MAX`, and optionally `CACHE_VERSION`.
  - Use `CACHE_VERSION` to safely invalidate old schemas without flushing the entire instance.
- **Operational Checklist**
  - Monitor: cache hit ratio, Redis latency, memory usage, and error rates.
  - Set `maxmemory` with an eviction policy suitable for your workload (e.g. `allkeys-lru` or `volatile-lru`).
  - Verify graceful behavior by temporarily stopping Redis and confirming the API still serves responses from the database.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For issues and questions:
- Create an issue in the repository
- Contact: support@primustech.in

## Acknowledgments

- FastAPI for the amazing framework
- SQLAlchemy for database ORM
- All contributors and testers