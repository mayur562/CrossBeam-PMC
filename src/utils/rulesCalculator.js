export function calculateCompliance(inputs, rulesData) {
  if (!rulesData || !inputs.plotArea || !inputs.roadWidth) {
    return null;
  }

  const plotArea = parseFloat(inputs.plotArea);
  const roadWidth = parseFloat(inputs.roadWidth);
  const tenementArea = inputs.tenementArea ? parseFloat(inputs.tenementArea) : null;
  const isCongested = inputs.congestion === 'congested';
  
  let setbackData = null;
  let fsiData = null;
  let parkingData = null;

  // 1. Calculate Setbacks
  if (isCongested) {
    const rows = rulesData.setback_table_congested?.rows || [];
    setbackData = rows.find(r => 
      roadWidth >= r.min_road_width && 
      (r.max_road_width === null || roadWidth < r.max_road_width)
    );
  } else {
    const rows = rulesData.setback_table_non_congested?.rows || [];
    setbackData = rows.find(r => 
      plotArea >= r.min_plot_size_sqm &&
      roadWidth >= r.min_road_width && 
      (r.max_road_width === null || roadWidth < r.max_road_width)
    );
  }

  // 2. Calculate FSI
  const fsiRows = isCongested ? rulesData.fsi_table_congested?.rows : rulesData.fsi_table_non_congested?.rows;
  fsiData = fsiRows?.find(r => 
    roadWidth >= r.min_road_width && 
    (r.max_road_width === null || roadWidth < r.max_road_width)
  );

  // 3. Calculate Parking
  if (tenementArea) {
    const parkingRows = rulesData.parking?.rows || [];
    if (isCongested) {
      // Check for congested-only edge case first
      const congestedRow = parkingRows.find(r => 
        r.congested_only && 
        plotArea <= r.max_plot_area && 
        tenementArea <= r.max_area
      );
      if (congestedRow) {
        parkingData = congestedRow;
      }
    }
    
    if (!parkingData) {
      // Fallback to standard table
      parkingData = parkingRows.find(r => 
        !r.congested_only &&
        tenementArea >= r.min_area && 
        (r.max_area === null || tenementArea < r.max_area)
      );
    }
  }

  if (setbackData || fsiData || parkingData) {
    return {
      setback: setbackData,
      fsi: fsiData,
      parking: parkingData,
      heightRule: rulesData.height?.rule
    };
  } else {
    return { notFound: true };
  }
}
