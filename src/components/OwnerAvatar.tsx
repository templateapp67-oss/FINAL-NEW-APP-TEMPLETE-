import { getOwnerInitials } from '../lib/ownerProfile';

interface Props {
  photoUrl?: string;
  name?: string;
  className?: string;
  alt?: string;
}

/** Circular owner photo with initials fallback when no image is saved. */
export default function OwnerAvatar({ photoUrl, name, className = '', alt }: Props) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={alt || name || 'Owner photo'}
        className={`object-cover ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`bg-[#ffd9e1] text-[#ac0053] flex items-center justify-center font-bold select-none ${className}`}
      aria-label={name ? `${name} photo placeholder` : 'Owner photo placeholder'}
    >
      {getOwnerInitials(name)}
    </div>
  );
}
