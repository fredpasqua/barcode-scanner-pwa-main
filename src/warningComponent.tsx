import { useEffect, useState } from "react";

type NewComponentProps = {
  warningMsg?: {
    warning: string;
  };
};

export default function Warning({ warningMsg }: NewComponentProps) {
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

  return <div className="red ">{warningMsg.warning}</div>;
}
