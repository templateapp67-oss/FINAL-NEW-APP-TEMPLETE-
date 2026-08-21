import React from 'react';

interface Props {
  bookingId: string;
  service: string;
  date: string;
  time: string;
  staff: string;
  customer: string;
  price: number;
  advancePaid: number;
}

export default function BookingConfirmation({ 
  bookingId, 
  service, 
  date, 
  time, 
  staff, 
  customer, 
  price, 
  advancePaid 
}: Props) {
  const payAtSalon = price - advancePaid;

  const handleShare = async () => {
    const shareData = {
      title: 'Booking Confirmation',
      text: `Booking Details: ${service} on ${date} at ${time}. Booking ID: ${bookingId}`,
      url: window.location.href
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      alert('Booking details copied to clipboard!');
    }
  };

  return (
    <div className="font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col items-center justify-center p-4 bg-[#F9F8F6]">
      <main className="w-full max-w-[600px] bg-white rounded-2xl shadow-level-1 border border-[#e2e2e2] overflow-hidden">
        <div className="px-6 py-8 md:px-10 md:py-12 flex flex-col items-center text-center border-b border-[#e2e2e2] bg-[#f9f9f9]">
          <div className="mb-8">
            <span className="text-2xl font-bold text-[#ac0053] tracking-tight">Nexora Lumina</span>
          </div>
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-6 shadow-sm border border-green-100">
            <span className="material-symbols-outlined text-green-600 text-5xl">check_circle</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface mb-2">Booking Confirmed!</h1>
          <p className="text-lg text-secondary mb-4">Your appointment is confirmed.</p>
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f3f3f4] border border-[#e2e2e2] font-semibold text-sm text-[#5b3f46]">
            Booking ID: {bookingId}
          </div>
        </div>
        
        <div className="p-6 md:p-10 space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-[#5b3f46] uppercase tracking-wider mb-4">Appointment Details</h2>
            <div className="bg-white border border-[#e2e2e2] rounded-xl p-5 shadow-level-1">
              <ul className="space-y-4 text-body-md">
                <li className="flex justify-between items-center pb-3 border-b border-[#f3f3f4]">
                  <span className="text-secondary flex items-center gap-2">Service</span>
                  <span className="font-medium">{service}</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-[#f3f3f4]">
                  <span className="text-secondary flex items-center gap-2">Date</span>
                  <span className="font-medium">{date}</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-[#f3f3f4]">
                  <span className="text-secondary flex items-center gap-2">Time</span>
                  <span className="font-medium">{time}</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-[#f3f3f4]">
                  <span className="text-secondary flex items-center gap-2">Staff</span>
                  <span className="font-medium">{staff}</span>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-secondary flex items-center gap-2">Customer</span>
                  <span className="font-medium">{customer}</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div>
            <h2 className="text-sm font-semibold text-[#5b3f46] uppercase tracking-wider mb-4">Payment Summary</h2>
            <div className="bg-white border border-[#e2e2e2] rounded-xl p-5 shadow-level-1">
              <ul className="space-y-3 text-body-md mb-4">
                <li className="flex justify-between items-center">
                  <span className="text-secondary">Service Price</span>
                  <span>₹{price}</span>
                </li>
                <li className="flex justify-between items-center text-green-700 bg-green-50/50 p-2 rounded-lg border border-green-100">
                  <span className="flex items-center gap-1">Advance Paid</span>
                  <span className="font-medium">₹{advancePaid}</span>
                </li>
                <li className="flex justify-between items-center pt-3 border-t border-[#e2e2e2] font-medium">
                  <span className="text-on-surface">Pay at Salon</span>
                  <span className="text-[#ac0053] text-lg">₹{payAtSalon}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <button
              className="w-full bg-[#ac0053] hover:bg-[#8f0044] text-white font-semibold py-4 px-6 rounded-lg transition-colors flex justify-center items-center gap-2"
              onClick={() => {
                // Placeholder for 'Done' action
                alert('Done clicked!');
              }}
            >
              Done
            </button>
            <button
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-2 bg-white border border-[#e2e2e2] text-on-surface font-semibold py-3 px-4 rounded-lg hover:bg-[#f3f3f4] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">ios_share</span>
              Share Booking
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
