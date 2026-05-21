import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import { IoGameControllerOutline } from 'react-icons/io5';

import 'swiper/css';
import 'swiper/css/navigation';

/**
 * Prize carousel — Pavan's visual shell wired to real prizes data
 * (prizesService.list()). Each slide shows the prize image, coin cost,
 * and a Redeem button. The cards reuse the same `.shopcard glassyfinish`
 * styling Pavan's shop carousel uses so the look is consistent across
 * Rewards, Shop, and Games.
 */
export default function PrizeCarousel({
  prizes = [],
  loading = false,
  error = null,
  coins = 0,
  redeemingId = null,
  onRedeem,
}) {
  return (
    <div className="shopslider">
      <div className="shopheader">
        <h2 className="lableheading">Prize Vault</h2>
        <div className="navbuttons">
          <div className="swiper-button-prev custom-nav prize-prev"></div>
          <div className="swiper-button-next custom-nav prize-next"></div>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 20, color: '#9CA3AF' }}>Loading prizes…</div>
      )}
      {error && !loading && (
        <div style={{ padding: 20, color: '#fca5a5' }}>{error}</div>
      )}
      {!loading && !error && prizes.length === 0 && (
        <div style={{ padding: 20, color: '#9CA3AF' }}>
          No prizes configured yet. Ask an admin to add items.
        </div>
      )}

      {!loading && !error && prizes.length > 0 && (
        <Swiper
          slidesPerView={4}
          spaceBetween={30}
          navigation={{ nextEl: '.prize-next', prevEl: '.prize-prev' }}
          modules={[Navigation]}
          className="mySwiper"
          breakpoints={{
            320: { slidesPerView: 1 },
            768: { slidesPerView: 3 },
            1024: { slidesPerView: 4 },
          }}
        >
          {prizes.map((p) => {
            const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
            const canAfford = coins == null || coins >= p.coinCost;
            const isRedeeming = redeemingId === p.id;
            return (
              <SwiperSlide key={p.id}>
                <div className="shopcard glassyfinish">
                  <div className="cardtop">
                    {p.tier && (
                      <div className="badge redbadge">{String(p.tier).toUpperCase()}</div>
                    )}
                    {p.image ? (
                      <img src={p.image} alt={p.name} />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(63,168,176,0.15))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 48,
                        }}
                      >
                        🎁
                      </div>
                    )}
                  </div>

                  <div className="daily-card">
                    <div className="daily-content">
                      <h2>{p.name}</h2>
                      {p.description && (
                        <p style={{ color: '#9CA3AF', fontSize: 12 }}>{p.description}</p>
                      )}
                      <div className="bottom-section">
                        <div className="reward">
                          <IoGameControllerOutline />
                          <span className="coins">{Number(p.coinCost || 0).toLocaleString()}</span>
                        </div>
                        {typeof p.stock === 'number' && (
                          <span style={{ fontSize: 11, color: outOfStock ? '#fca5a5' : '#9CA3AF' }}>
                            {outOfStock ? 'Sold out' : `${p.stock} left`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="coinsbtn Prizesbtn"
                        disabled={outOfStock || !canAfford || isRedeeming}
                        onClick={() => onRedeem && onRedeem(p)}
                      >
                        {isRedeeming
                          ? 'Redeeming…'
                          : outOfStock
                            ? 'Sold Out'
                            : canAfford
                              ? 'Claim'
                              : 'Need more coins'}
                      </button>
                    </div>
                  </div>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>
      )}
    </div>
  );
}
