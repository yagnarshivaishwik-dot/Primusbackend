import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/navigation';

/**
 * Challenge / quest carousel on the Rewards page.
 *
 * Same three placeholder quests as HomePage (TECH_DEBT #21 — admin CRUD +
 * progression engine not built yet), surfaced here so the customer can
 * also claim them from the Rewards tab. Reuses the kiosk's
 * `.shopcard glassyfinish` + `.daily-card` styling Pavan defined.
 */

const CHALLENGES = [
  {
    id: 'checkin',
    title: 'Daily Check In',
    desc: 'Login today',
    xp: 50,
    coins: 25,
    progressPct: 100,
  },
  {
    id: 'streak',
    title: 'Streak Master',
    desc: 'Login 7 days in a row',
    xp: 1000,
    coins: 25,
    progressPct: 86,
  },
  {
    id: 'hour',
    title: 'Hour Power',
    desc: 'Spend at least 1 hour today',
    xp: 75,
    coins: 50,
    progressPct: 75,
  },
];

export default function ChallengeCarousel({
  claimedKinds = [],
  claimingKind = null,
  onClaim,
}) {
  return (
    <div className="shopslider">
      <div className="shopheader">
        <h2 className="lableheading">Challenges</h2>
        <div className="navbuttons">
          <div className="swiper-button-prev custom-nav challenge-prev"></div>
          <div className="swiper-button-next custom-nav challenge-next"></div>
        </div>
      </div>

      <Swiper
        slidesPerView={4}
        spaceBetween={30}
        navigation={{ nextEl: '.challenge-next', prevEl: '.challenge-prev' }}
        modules={[Navigation]}
        className="mySwiper"
        breakpoints={{
          320: { slidesPerView: 1 },
          768: { slidesPerView: 3 },
          1024: { slidesPerView: 4 },
        }}
      >
        {CHALLENGES.map((c) => {
          const isClaimed = claimedKinds.includes(c.id);
          const isClaiming = claimingKind === c.id;
          return (
            <SwiperSlide key={c.id}>
              <div className="shopcard glassyfinish">
                <div className="daily-card">
                  <div className="daily-content">
                    <h2>{c.title}</h2>
                    <p>{c.desc}</p>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${c.progressPct}%` }}
                      />
                    </div>
                    <div className="bottom-section">
                      <div className="reward">
                        <span>{c.xp} XP</span>
                        <span className="coins">Coins-{c.coins}</span>
                      </div>
                      <button
                        type="button"
                        className="coinsbtn"
                        disabled={isClaimed || isClaiming}
                        onClick={() => onClaim && onClaim(c.id)}
                      >
                        {isClaimed ? 'Claimed' : isClaiming ? 'Claiming…' : 'Claim'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}
