import '../../../styles/shop.css';
import React, { useState } from 'react';


function Shop() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState([
    { id: 1, name: 'Day Pass', price: 2500, quantity: 1, type: 'day-pass' },
    { id: 2, name: 'Coca-Cola', price: 250, quantity: 1, type: 'coca-cola' }
  ]);

  const categories = [
    'All',
    'Game Passes',
    'Snacks & Drinks',
    'Merchandise',
    'Digital Items',
    'Event Tickets'
  ];

  const popularProducts = [
    {
      id: 1,
      name: 'Day Pass',
      price: 2500,
      image: 'day-pass',
      badge: 'Popular',
      badgeType: 'popular',
      icon: '🎮',
      added: true
    },
    {
      id: 2,
      name: 'Coca-Cola',
      price: 250,
      image: 'coca-cola',
      badge: 'Most Popular',
      badgeType: 'most-popular',
      icon: '🥤',
      added: true
    },
    {
      id: 3,
      name: 'XP Boost ×2 (1hr)',
      price: 300,
      image: 'xp-boost',
      badge: 'Hot',
      badgeType: 'hot',
      icon: '⚡',
      added: false
    },
    {
      id: 4,
      name: 'Friday Night LAN Party',
      price: 999,
      image: 'lan-party',
      badge: 'Upcoming',
      badgeType: 'upcoming',
      icon: '🎧',
      added: false
    }
  ];

  const gamePasses = [
    { id: 1, duration: '15 Minutes', label: '15 Minutes', price: 150, className: 'minutes-15' },
    { id: 2, duration: '15 Minutes', label: '30 Minutes', price: 250, className: 'minutes-30' },
    { id: 3, duration: '1 Hour', label: '1 Hour', price: 500, className: 'hour-1' },
    { id: 4, duration: '4 Hours', label: '4 Hours', price: 1500, className: 'hours-4' }
  ];

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2 className="sidebar-title">Browse by Category</h2>
        <nav>
          <ul className="sidebar-nav">
            {categories.map((category) => (
              <li
                key={category}
                className={`sidebar-item ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <input
          type="text"
          className="search-bar"
          placeholder="Search products, game passes, snacks..."
        />

        {/* Popular Products Section */}
        <section className="section sectionBg">
          <div className="section-header">
            <h2 className="section-title">Popular at ClutcHH</h2>
            <div className="section-nav">
              <button className="nav-arrow">‹</button>
              <button className="nav-arrow">›</button>
            </div>
          </div>
          <div className="product-grid">
            {popularProducts.map((product) => (
              <div key={product.id} className="product-card">
                <div className={`product-image ${product.image}`}>
                  <span className={`product-badge`}>
                    {product.badge}
                  </span>
                  <span className="product-icon">{product.icon}</span>
                </div>
                <div className="product-info">
                  <h3 className="product-name">{product.name}</h3>
                  <p className="product-price">{product.price.toLocaleString()} coins</p>
                  <button className={`add-to-cart-btn ${product.added ? 'added' : ''}`}>
                    {product.added ? '✓ Added' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* Game Passes Section */}
         <section className="section">
          <div className="section-header">
            <h2 className="section-title">Game Passes</h2>
            <div className="section-nav">
              <button className="nav-arrow">‹</button>
              <button className="nav-arrow">›</button>
            </div>
          </div>
          <div className="product-grid">
            {popularProducts.map((product) => (
              <div key={product.id} className="product-card">
                <div className={`product-image ${product.image}`}>
                  <span className="product-icon">{product.icon}</span>
                </div>
                <div className="product-info">
                  <h3 className="product-name">{product.name}</h3>
                  <p className="product-price">{product.price.toLocaleString()} coins</p>
                  <button className={`add-to-cart-btn ${product.added ? 'added' : ''}`}>
                    {product.added ? '✓ Added' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        
      </main>

      {/* Right Panel */}
      <aside className="right-panel">
        {/* Balance Section */}
        <div className="balance-section">
          <p className="balance-label">Your Balance</p>
          <div className="balance-amount">
            <span className="coin-icon">🪙</span>
            <span>3,200</span>
          </div>
          {/* <p className="balance-sublabel">Your Balance</p> */}
          <button className="add-coins-btn">Add Coins</button>
        </div>

        {/* Cart Section */}
        <div className="cart-section">
          <div className="cart-header">
            <h3 className="cart-title">Cart</h3>
            <span className="cart-count">{cart.length}</span>
          </div>

          {cart.map((item) => (
            <div key={item.id} className="cart-item">
              <div className={`cart-item-icon ${item.type}`}>
                {item.type === 'day-pass' ? '🎮' : '🥤'}
              </div>
              <div className="cart-item-details">
                <p className="cart-item-name">{item.name}</p>
                <p className="cart-item-price">{item.price.toLocaleString()} coins</p>
              </div>
              <div className="cart-item-actions">
                <button className="cart-item-remove">×</button>
                <div className="cart-item-quantity">
                  <button className="quantity-btn">−</button>
                  <span>{item.quantity}</span>
                  <button className="quantity-btn">+</button>
                </div>
              </div>
            </div>
          ))}

          <div className="cart-total">
            <span className="total-label">Total</span>
            <span className="total-amount">{getTotal().toLocaleString()} coins</span>
          </div>

          <button className="checkout-btn">Checkout</button>
        </div>
      </aside>
    </div>
  );
};

export default Shop;
