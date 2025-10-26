function decodeDescripcion(descripcion) {
    return descripcion
      .replace(/�/g, 'ñ') // Reemplaza caracteres extraños según sea necesario
      .replace(/Ã±/g, 'ñ') // Ejemplo: codificación errónea de 'ñ'
      .replace(/&aacute;/g, 'á')
      .replace(/&eacute;/g, 'é')
      .replace(/&iacute;/g, 'í')
      .replace(/&oacute;/g, 'ó')
      .replace(/&uacute;/g, 'ú')
      .replace(/&Aacute;/g, 'Á')
      .replace(/&Eacute;/g, 'É')
      .replace(/&Iacute;/g, 'Í')
      .replace(/&Oacute;/g, 'Ó')
      .replace(/&Uacute;/g, 'Ú');
  }
  
  // Dentro de tu lógica de reemplazo de SITLAB
  if (mapaSituaciones[registro.SITLAB]) {
    registro.SITLAB = decodeDescripcion(mapaSituaciones[registro.SITLAB]);
  } else {
    registro.SITLAB = 'Descripción no encontrada'; // Manejo de errores
  }