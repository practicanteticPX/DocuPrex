import { useRef, useEffect } from 'react';
import './JokerAvatarCard.css';

interface JokerAvatarCardProps {
  avatarUrl: string;
  name: string;
  role: string;
  className?: string;
}

const JokerAvatarCard = ({ avatarUrl, name, role, className = '' }: JokerAvatarCardProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const card = cardRef.current;
    if (!container || !card) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      container.style.setProperty('--x', `${x}%`);
      container.style.setProperty('--y', `${y}%`);
    };

    const handleMouseLeave = () => {
      container.style.setProperty('--x', '50%');
      container.style.setProperty('--y', '50%');
      if (card) {
        card.style.transform = 'rotateY(0deg) rotateX(0deg)';
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className={`joker-card-container ${className}`}>
      <div className="joker-card-grid">
        {Array.from({ length: 16 }).map((_, index) => (
          <div key={index} className="joker-card-grid-item" />
        ))}
      </div>

      <div ref={cardRef} className="joker-card">
        <div className="joker-card-inner">
          <div className="joker-card-decoration joker-card-decoration-top-left">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>

          <div className="joker-card-avatar">
            <img src={avatarUrl} alt={name} loading="eager" />
          </div>

          <div className="joker-card-content">
            <h2 className="joker-card-name">{name}</h2>
            <p className="joker-card-role">{role}</p>
          </div>

          <div className="joker-card-decoration joker-card-decoration-bottom-right">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JokerAvatarCard;
