import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import { Navigation } from "swiper/modules";
import "./ShopCarousel.css";

/**
 * ShopCarousel — Pavan's visual, wired to real pack data.
 *
 * Props:
 *   title       — heading shown above the carousel
 *   packs       — array from shopService.list() (id, name, price, minutes, description, badge, thumbnailUrl)
 *   onAddToCart — invoked when "Add to Cart" is clicked on a card
 *   cart        — current cart items (so each card knows whether it's
 *                 already added and can render +/- instead of the add button)
 *   onBumpQty   — (id, delta) used by the inline +/- counter
 */
const ShopCarousel = ({
  title = "Popular at NoLag",
  packs = [],
  onAddToCart,
  cart = [],
  onBumpQty,
}) => {
  if (!packs.length) {
    return (
      <div className="shopslider">
        <div className="shopheader">
          <h2 className="lableheading">{title}</h2>
        </div>
        <div style={{ padding: "20px", color: "#9CA3AF", fontSize: "14px" }}>
          No packs available yet.
        </div>
      </div>
    );
  }

  // Strip ALL non-alphanumeric chars (Swiper uses these as CSS selectors;
  // '&', spaces, and special chars break selector parsing).
  const navId = title.replace(/[^a-zA-Z0-9]/g, "-");

  return (
    <div className="shopslider">
      <div className="shopheader">
        <h2 className="lableheading">{title}</h2>
        <div className="navbuttons">
          <div className={`swiper-button-prev custom-nav prev-${navId}`}></div>
          <div className={`swiper-button-next custom-nav next-${navId}`}></div>
        </div>
      </div>
      <Swiper
        slidesPerView={4}
        spaceBetween={30}
        navigation={{
          nextEl: `.next-${navId}`,
          prevEl: `.prev-${navId}`,
        }}
        modules={[Navigation]}
        className="mySwiper"
        breakpoints={{
          320: { slidesPerView: 1 },
          768: { slidesPerView: 3 },
          1024: { slidesPerView: 4 },
        }}
      >
        {packs.map((pack) => {
          const cartItem = cart.find((c) => c.id === pack.id);
          const inCart = Boolean(cartItem);
          const qty = cartItem?.quantity ?? 0;
          return (
            <SwiperSlide key={pack.id}>
              <div className="shopcard glassyfinish">
                <div className="cardtop">
                  {pack.badge && (
                    <div className="badge redbadge">{pack.badge}</div>
                  )}
                  {pack.thumbnailUrl ? (
                    <img src={pack.thumbnailUrl} alt={pack.name} />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        background:
                          "linear-gradient(135deg, rgba(255,107,53,0.15), rgba(63,168,176,0.15))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "48px",
                      }}
                    >
                      ⏱
                    </div>
                  )}
                </div>
                <div className="cardbottom">
                  <div className="carddetails">
                    <h4>{pack.name}</h4>
                    <h6>
                      {pack.minutes ? `${pack.minutes} min` : ""}
                      {pack.description ? ` • ${pack.description}` : ""}
                    </h6>
                    <h5>₹{Number(pack.price || 0).toLocaleString()}</h5>
                  </div>
                  {inCart ? (
                    // Inline +/- counter once the pack is added. Replaces the
                    // Add to Cart button so the customer can adjust qty
                    // without hunting in the sidebar.
                    <div className="cardcounter glassyfinish">
                      <button
                        type="button"
                        className="cardcounter__btn"
                        aria-label={`Decrease quantity of ${pack.name}`}
                        onClick={() => onBumpQty && onBumpQty(pack.id, -1)}
                      >
                        −
                      </button>
                      <span className="cardcounter__qty">{qty}</span>
                      <button
                        type="button"
                        className="cardcounter__btn"
                        aria-label={`Increase quantity of ${pack.name}`}
                        onClick={() => onBumpQty && onBumpQty(pack.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="cardbutton glassyfinish">
                      <button onClick={() => onAddToCart && onAddToCart(pack)}>
                        Add to Cart
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
};

export default ShopCarousel;
