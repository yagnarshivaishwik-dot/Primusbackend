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
 */
export default function GameCarousel({
  games,
  filters,
  activeFilter,
  onFilterChange,
  onLaunch,
  launchingId,
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

        {games.length === 0 ? (
          <div style={{ padding: 20, color: '#9CA3AF' }}>
            No games match this filter. Ask an admin to add games in the admin panel.
          </div>
        ) : (
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
          </Swiper>
        )}
      </div>
    </>
  );
}
