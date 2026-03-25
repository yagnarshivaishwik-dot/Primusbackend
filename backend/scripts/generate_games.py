import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime

from app.database import SessionLocal
from app.models import Game


def generate_games():
    db = SessionLocal()

    # Games from the screenshot in order
    games_data = [
        # Row 1
        {"name": "Battle for the Banner - Winter Open", "category": "game", "enabled": False},
        {"name": "FBC FireBreak", "category": "game", "enabled": False},
        {"name": "Tableau Prep Builder", "category": "app", "enabled": False},
        {"name": "Clix IT Helpdesk", "category": "app", "enabled": False},
        {"name": "[REDACTED]", "category": "game", "enabled": False},
        {"name": "10 Second Ninja X", "category": "game", "enabled": False},
        {"name": "100 Christmas Cats", "category": "game", "enabled": False},
        {"name": "100 li'l jumps", "category": "game", "enabled": False},
        {"name": "100 Ninja Cats", "category": "game", "enabled": False},
        # Row 2
        {"name": "100% Orange Juice", "category": "game", "enabled": False},
        {"name": "1-1-2 OP 112 Operator", "category": "game", "enabled": False},
        {"name": "12 Labours of Hercules", "category": "game", "enabled": False},
        {"name": "123123", "category": "game", "enabled": False},
        {"name": "1979 Revolution: Black Friday", "category": "game", "enabled": False},
        {"name": "1v1.LOL", "category": "game", "enabled": False},
        {"name": "20XX - Epic", "category": "game", "enabled": False},
        {"name": "2XKO", "category": "game", "enabled": False},
        {"name": "GameLoop 3 Game Loop", "category": "app", "enabled": False},
        # Row 3
        {"name": "3 Out of 10 Ep 1", "category": "game", "enabled": False},
        {"name": "3 Out of 10 Ep 2", "category": "game", "enabled": False},
        {"name": "3 Out of 10 Ep 3", "category": "game", "enabled": False},
        {"name": "3 Out of 10 ep 4", "category": "game", "enabled": False},
        {"name": "3 Out of 10 Ep 5", "category": "game", "enabled": False},
        {"name": "3 out of 10: Season Two", "category": "game", "enabled": False},
        {"name": "3D Pinball Space Cadet", "category": "game", "enabled": False},
        {"name": "3DMark", "category": "app", "enabled": False},
        {"name": "3Ds Max", "category": "app", "enabled": False},
        # Row 4
        {"name": "3ON3 FREESTYLE", "category": "game", "enabled": False},
        {"name": "60 SECONDS!", "category": "game", "enabled": False},
        {"name": "DAYS TO E...", "category": "game", "enabled": False},
        {"name": "BIT FIESTA THE DRINKING GAME!", "category": "game", "enabled": False},
    ]

    # Generate additional games to reach 5399 total
    # We'll create games with realistic names
    game_prefixes = [
        "Adventure",
        "Battle",
        "Castle",
        "Dragon",
        "Epic",
        "Fantasy",
        "Galaxy",
        "Hero",
        "Island",
        "Journey",
        "Kingdom",
        "Legend",
        "Magic",
        "Night",
        "Ocean",
        "Quest",
        "Racing",
        "Space",
        "Tower",
        "Warrior",
        "Zombie",
        "Cyber",
        "Steam",
        "Pixel",
        "Retro",
        "Arcade",
        "RPG",
        "Strategy",
        "Action",
        "Puzzle",
    ]

    game_suffixes = [
        "Quest",
        "Adventure",
        "Battle",
        "Chronicles",
        "Legends",
        "Wars",
        "Empire",
        "Kingdom",
        "Realm",
        "World",
        "Story",
        "Tales",
        "Saga",
        "Trilogy",
        "Collection",
        "Edition",
        "Deluxe",
        "Ultimate",
        "Pro",
        "Plus",
    ]

    app_prefixes = [
        "Office",
        "Design",
        "Edit",
        "Create",
        "Build",
        "Manage",
        "Analyze",
        "Process",
        "Convert",
        "Optimize",
        "Secure",
        "Backup",
        "Monitor",
        "Control",
        "Connect",
        "Share",
        "Sync",
        "Store",
        "Organize",
        "Plan",
    ]

    app_suffixes = [
        "Pro",
        "Studio",
        "Suite",
        "Tool",
        "Manager",
        "Editor",
        "Creator",
        "Builder",
        "Analyzer",
        "Converter",
        "Optimizer",
        "Protector",
        "Backup",
        "Monitor",
        "Controller",
        "Connector",
        "Organizer",
        "Planner",
    ]

    # Generate games until we reach 5399
    current_count = len(games_data)
    target_count = 5399

    import random

    # Track used names to avoid duplicates
    used_names = set(game["name"] for game in games_data)

    # Generate more games
    while current_count < target_count:
        attempts = 0
        while attempts < 100:  # Limit attempts to avoid infinite loop
            if random.random() < 0.8:  # 80% games, 20% apps
                prefix = random.choice(game_prefixes)
                suffix = random.choice(game_suffixes)
                name = f"{prefix} {suffix}"
                category = "game"
            else:
                prefix = random.choice(app_prefixes)
                suffix = random.choice(app_suffixes)
                name = f"{prefix} {suffix}"
                category = "app"

            # Add some variety with numbers and special characters
            if random.random() < 0.3:
                name += f" {random.randint(1, 999)}"
            if random.random() < 0.1:
                name += " HD"
            if random.random() < 0.05:
                name += " Remastered"

            # Ensure unique name
            if name not in used_names:
                used_names.add(name)
                games_data.append({"name": name, "category": category, "enabled": False})
                current_count += 1
                break
            attempts += 1

        if attempts >= 100:
            # If we can't generate unique names, add a unique identifier
            base_name = f"Game {current_count + 1}"
            games_data.append({"name": base_name, "category": "game", "enabled": False})
            current_count += 1

    # Sort alphabetically and ensure "A Good Snowman Is Hard To Build" is included
    # Add it at the beginning since it starts with "A"
    if not any(game["name"] == "A Good Snowman Is Hard To Build" for game in games_data):
        games_data.insert(
            0, {"name": "A Good Snowman Is Hard To Build", "category": "game", "enabled": False}
        )

    # Sort alphabetically
    games_data.sort(key=lambda x: x["name"].lower())

    # Ensure we have exactly 5399 games
    games_data = games_data[:5399]

    print(f"Generating {len(games_data)} games...")

    # Clear existing games
    db.query(Game).delete()
    db.commit()

    # Create games with logos
    for i, game_data in enumerate(games_data):
        # Generate a simple logo URL based on the game name
        logo_url = f"/images/games/{game_data['name'].replace(' ', '_').replace('[', '').replace(']', '').replace(':', '').replace('!', '').lower()}.jpg"

        game = Game(
            name=game_data["name"],
            category=game_data["category"],
            enabled=game_data["enabled"],
            logo_url=logo_url,
            description=f"{game_data['name']} - {'Game' if game_data['category'] == 'game' else 'Application'}",
            last_updated=datetime.utcnow(),
        )
        db.add(game)

        if (i + 1) % 100 == 0:
            print(f"Created {i + 1} games...")
            db.commit()

    db.commit()
    print(f"Successfully created {len(games_data)} games!")

    # Verify count
    total_games = db.query(Game).count()
    print(f"Total games in database: {total_games}")

    db.close()


if __name__ == "__main__":
    generate_games()
