import React, { useState, useEffect } from "react";
import '../../../styles/Home.css';

const videos = [
  {
    title: "FORTNITE",
    video: "/videos/fortnite.mp4",
    thumbnail: "/images/fortnite.jpg",
  },
  {
    title: "VALORANT",
    video: "/videos/valorant.mp4",
    thumbnail: "/images/valorant.jpg",
  },
  {
    title: "CS GO",
    video: "/videos/csgo.mp4",
    thumbnail: "/images/csgo.jpg",
  },
];

function LoginPage() {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto slide
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % videos.length);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="carousel-container">
      {/* Background Videos */}
      {videos.map((item, index) => (
        <video
          key={index}
          className={`bg-video ${index === activeIndex ? "active" : ""}`}
          src={item.video}
          autoPlay
          loop
          muted
        />
      ))}

      {/* Overlay */}
      <div className="overlay" />

      {/* Left Content */}
      <div className="left-content">
        <h1>{videos[activeIndex].title}</h1>
        <button className="launch-btn">▶ LAUNCH VIA STEAM</button>

        <div className="thumbnails">
          {videos.map((item, index) => (
            <img
              key={index}
              src={item.thumbnail}
              alt=""
              className={index === activeIndex ? "active" : ""}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        <div className="card red">
          <h3>Happy Hour: 2-5 PM</h3>
          <p>30% EXTRA</p>
        </div>

        <div className="card">
          <h4>Daily Check-In</h4>
          <button>Claim</button>
        </div>

        <div className="card">
          <h4>Streak Master</h4>
          <p>6/7 days</p>
        </div>

        <div className="card">
          <h4>Hour Power</h4>
          <p>45/60 min</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;