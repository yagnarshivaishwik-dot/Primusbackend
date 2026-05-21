import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import { FaPlay } from 'react-icons/fa';

import GameImage from '@/assets/image/gameimage.png';

import 'swiper/css';
import 'swiper/css/navigation';

/**
 * GameCarousel — Pavan's NoLag visual shell, fed by live data.
 *
 * Receives the already-filtered game list from GamesPage and renders it as a
 * Swiper carousel with Pavan's hover-reveal LAUNCH button. The filter chips
 * are derived from the live game tags so they always match what's actually in
 * the catalog rather than a hardcoded list.
 *
 * `onAdd` (optional) appends a trailing "+" slide so admins can open the
 * "Add games from this PC" modal directly from the catalog. When the
 * catalog is empty it's the only thing in the carousel, doubling as the
 * empty-state CTA.
 */
export default function GameCarousel({
  games,
  filters,
  activeFilter,
  onFilterChange,
  onLaunch,
  launchingId,
  onAdd,
}) {
  return (
    <>
      <div className="filters">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            className={`filter-btn${activeFilter === f ? ' active' : ''}`}
            onClick={() => onFilterChange(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="shopslider">
        <div className="shopheader">
          <h2 className="lableheading">Popular at NoLag</h2>
          <div className="navbuttons">
            <div className="swiper-button-prev custom-nav games-prev"></div>
            <div className="swiper-button-next custom-nav games-next"></div>
          </div>
        </div>

        <Swiper
          slidesPerView={6}
          spaceBetween={30}
          navigation={{ nextEl: '.games-next', prevEl: '.games-prev' }}
          modules={[Navigation]}
          className="mySwiper"
          breakpoints={{
            320: { slidesPerView: 1 },
            768: { slidesPerView: 3 },
            1024: { slidesPerView: 6 },
          }}
        >
          {games.map((g) => {
            const img = g.imagePortrait || g.imageBackground || g.logo || GameImage;
            const isLaunching = launchingId === g.id;
            return (
              <SwiperSlide key={g.id}>
                <div className="gamecradset">
                  <div className="gamecard">
                    {g.badge != null && <div className="gamebadge">{g.badge}</div>}
                    <img src={img} alt={g.name} />
                    <button
                      type="button"
                      className="launchgame"
                      onClick={() => onLaunch(g)}
                      disabled={isLaunching}
                    >
                      <FaPlay /> {isLaunching ? 'LAUNCHING…' : 'LAUNCH'}
                    </button>
                    <div className="overlayeffect"></div>
                    <div className="gamecardcontent">
                      <div className="gamecardtitle">{g.name}</div>
                      <div className="gamecardsubtitle">{g.genre}</div>
                    </div>
                  </div>
                </div>
              </SwiperSlide>
            );
          })}

          {/* Trailing "+" slide. Same intent as the apps grid's add tile:
              always-visible affordance for admins to add more games via
              the scan modal, and the only slide visible when the catalog
              is empty. */}
          {onAdd && (
            <SwiperSlide key="__add__">
              <div className="gamecradset">
                <button
                  type="button"
                  onClick={onAdd}
                  aria-label={games.length === 0 ? 'Add games from this PC' : 'Add more games'}
                  className="gamecard"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '2px dashed rgba(255,255,255,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    minHeight: 280,
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 56, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>+</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                      {games.length === 0 ? 'Add games from this PC' : 'Add more'}
                    </div>
                  </div>
                </button>
              </div>
            </SwiperSlide>
          )}
        </Swiper>
      </div>
    </>
  );
}
