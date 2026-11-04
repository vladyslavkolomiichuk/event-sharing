export function approximateLocation(latitude: number, longitude: number) {
  const latitudeStep = 0.002;
  const roundedLatitude = Number(
    (Math.round(latitude / latitudeStep) * latitudeStep).toFixed(4),
  );
  const longitudeStep = Math.min(
    2,
    latitudeStep / Math.max(Math.cos((roundedLatitude * Math.PI) / 180), 0.1),
  );
  return {
    latitude: roundedLatitude,
    longitude: Math.max(
      -180,
      Math.min(
        180,
        Number(
          (Math.round(longitude / longitudeStep) * longitudeStep).toFixed(4),
        ),
      ),
    ),
  };
}
