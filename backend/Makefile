.PHONY: help install test lint format type-check migrate upgrade downgrade run dev clean

help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo "  make type-check   - Run type checker"
	@echo "  make migrate      - Create new migration"
	@echo "  make upgrade      - Apply migrations"
	@echo "  make downgrade    - Rollback last migration"
	@echo "  make run          - Run application"
	@echo "  make dev          - Run in development mode"
	@echo "  make clean        - Clean temporary files"

install:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt

test:
	pytest tests/ -v --cov=app --cov-report=html --cov-report=term

lint:
	ruff check .
	bandit -r app/

format:
	ruff format .
	black app/

type-check:
	mypy app/ --ignore-missing-imports

migrate:
	@read -p "Migration message: " msg; \
	alembic revision --autogenerate -m "$$msg"

upgrade:
	alembic upgrade head

downgrade:
	alembic downgrade -1

run:
	uvicorn main:app --host 0.0.0.0 --port 8000

dev:
	uvicorn main:app --host 0.0.0.0 --port 8000 --reload

clean:
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -r {} +
	find . -type d -name ".mypy_cache" -exec rm -r {} +
	rm -rf htmlcov/
	rm -f .coverage

ci-check: lint type-check test

