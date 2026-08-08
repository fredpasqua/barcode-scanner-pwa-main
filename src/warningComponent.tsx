import { useEffect, useState } from "react";
import React from "react";
type NewComponentProps = {
  warningMsg?: object;
};
export default function Warning( {warningMsg } : NewComponentProps ) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);
  if (!warningMsg || !visible) {
    return null;
  }
  return (
    <div>
      <p className="red flash-hard">{warningMsg.warning}</p>
    </div>
  );
}
